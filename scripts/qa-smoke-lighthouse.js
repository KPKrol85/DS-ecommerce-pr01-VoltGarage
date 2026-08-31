const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 4173);
const ROOT_DIR = process.cwd();
const KEY_PAGES = (process.env.SMOKE_PAGES || '/,/pages/shop.html,/pages/product.html')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const DEFAULT_THRESHOLDS = {
  performance: Number(process.env.SMOKE_THRESHOLD_PERFORMANCE || 0.4),
  accessibility: Number(process.env.SMOKE_THRESHOLD_ACCESSIBILITY || 0.75),
  'best-practices': Number(process.env.SMOKE_THRESHOLD_BEST_PRACTICES || 0.7),
  seo: Number(process.env.SMOKE_THRESHOLD_SEO || 0.7),
};

const ENFORCE = process.argv.includes('--enforce') || process.env.SMOKE_ENFORCE === '1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      resolve({ success: false, code: null, stdout, stderr, error });
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, code, stdout, stderr, error: null });
    });
  });
}

async function resolveLighthouseRunner() {
  const direct = process.env.SMOKE_LIGHTHOUSE_BIN || 'lighthouse';
  const directVersion = await runCommand(direct, ['--version']);

  if (directVersion.success) {
    return { command: direct, prefixArgs: [] };
  }

  const npxVersion = await runCommand('npx', ['--yes', 'lighthouse', '--version']);
  if (npxVersion.success) {
    return { command: 'npx', prefixArgs: ['--yes', 'lighthouse'] };
  }

  return null;
}

function safePathFromUrl(urlPath) {
  const [pathname] = urlPath.split('?');
  const decoded = decodeURIComponent(pathname);
  const withoutLeadingSlash = decoded.replace(/^\/+/, '');

  if (!withoutLeadingSlash || withoutLeadingSlash === '.') {
    return 'index.html';
  }

  return withoutLeadingSlash.endsWith('/')
    ? path.join(withoutLeadingSlash, 'index.html')
    : withoutLeadingSlash;
}

async function readFileForRequest(urlPath) {
  const relativePath = safePathFromUrl(urlPath);
  const fullPath = path.resolve(ROOT_DIR, relativePath);
  const normalizedRoot = `${ROOT_DIR}${path.sep}`;

  if (!fullPath.startsWith(normalizedRoot) && fullPath !== ROOT_DIR) {
    return null;
  }

  try {
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const indexPath = path.join(fullPath, 'index.html');
      return {
        content: await fs.readFile(indexPath),
        contentType: MIME_TYPES['.html'],
      };
    }

    const extension = path.extname(fullPath).toLowerCase();
    return {
      content: await fs.readFile(fullPath),
      contentType: MIME_TYPES[extension] || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    const requestPath = req.url || '/';
    const result = await readFileForRequest(requestPath);

    if (!result) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': result.contentType,
      'cache-control': 'no-store',
    });
    res.end(result.content);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  return server;
}

function toPercent(score) {
  return typeof score === 'number' ? Math.round(score * 100) : null;
}

function isCategoryPassing(name, score) {
  if (typeof score !== 'number') {
    return false;
  }

  const threshold = DEFAULT_THRESHOLDS[name];
  if (typeof threshold !== 'number' || Number.isNaN(threshold)) {
    return true;
  }

  return score >= threshold;
}

function printResults(results) {
  const baselineLabel = ENFORCE ? 'ENFORCED' : 'REPORT-ONLY';
  console.log(`\nLighthouse smoke check mode: ${baselineLabel}`);
  console.log(`Thresholds: ${JSON.stringify(DEFAULT_THRESHOLDS)}`);

  for (const pageResult of results) {
    console.log(`\nPage: ${pageResult.page}`);

    for (const [name, score] of Object.entries(pageResult.categories)) {
      const percent = toPercent(score);
      const status = isCategoryPassing(name, score) ? 'PASS' : 'WARN';
      const threshold = DEFAULT_THRESHOLDS[name];
      console.log(
        `  - ${name}: ${percent ?? 'n/a'} (${status}, threshold ${Math.round(threshold * 100)})`
      );
    }
  }
}

async function runLighthouseForPage(runner, page) {
  const targetUrl = `http://${HOST}:${PORT}${page}`;
  const args = [
    ...runner.prefixArgs,
    targetUrl,
    '--quiet',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
    '--output=json',
    '--output-path=stdout',
  ];

  const execution = await runCommand(runner.command, args);

  if (!execution.success) {
    const details = execution.stderr || execution.stdout || 'No additional details';
    throw new Error(`Lighthouse failed for ${page}: ${details.trim()}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(execution.stdout);
  } catch {
    throw new Error(`Unable to parse Lighthouse JSON output for ${page}.`);
  }

  const categories = {
    performance: parsed.categories?.performance?.score,
    accessibility: parsed.categories?.accessibility?.score,
    'best-practices': parsed.categories?.['best-practices']?.score,
    seo: parsed.categories?.seo?.score,
  };

  return { page, categories };
}

async function main() {
  const runner = await resolveLighthouseRunner();

  if (!runner) {
    const message =
      'Lighthouse CLI is not available. Install lighthouse or set SMOKE_LIGHTHOUSE_BIN.';

    if (ENFORCE) {
      throw new Error(message);
    }

    console.warn(`Smoke check skipped (report-only): ${message}`);
    return;
  }

  const server = await startStaticServer();

  try {
    const results = [];

    for (const page of KEY_PAGES) {
      results.push(await runLighthouseForPage(runner, page));
    }

    printResults(results);

    const failedChecks = results.flatMap((result) =>
      Object.entries(result.categories)
        .filter(([name, score]) => !isCategoryPassing(name, score))
        .map(([name, score]) => ({ page: result.page, category: name, score }))
    );

    if (failedChecks.length > 0) {
      console.log('\nBaseline warnings detected.');
      for (const failure of failedChecks) {
        const percent = toPercent(failure.score);
        const threshold = DEFAULT_THRESHOLDS[failure.category];
        console.log(
          `  - ${failure.page} :: ${failure.category} ${percent ?? 'n/a'} < ${Math.round(threshold * 100)}`
        );
      }

      if (ENFORCE) {
        console.error('\nSmoke check failed because --enforce mode is enabled.');
        process.exitCode = 1;
      } else {
        console.log('\nReport-only mode keeps this as non-blocking baseline output.');
      }
    } else {
      console.log('\nSmoke check baseline passed for all configured pages.');
    }
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error('Unable to run Lighthouse smoke checks.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
