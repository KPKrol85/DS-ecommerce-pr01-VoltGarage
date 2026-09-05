const { spawn } = require('node:child_process');
const path = require('node:path');

const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const PORT = Number(process.env.SMOKE_PORT || 4173);
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

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
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

async function runLighthouseForPage(page) {
  const targetUrl = `http://${HOST}:${PORT}${page}`;
  const args = [
    path.join(path.dirname(require.resolve('lighthouse/package.json')), 'cli/index.js'),
    targetUrl,
    '--quiet',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
    '--output=json',
    '--output-path=stdout',
  ];

  const execution = await runCommand(process.execPath, args);

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
  const { build, preview } = await import('vite');
  await build();
  const server = await preview({ preview: { host: HOST, port: PORT, strictPort: true } });

  try {
    const results = [];

    for (const page of KEY_PAGES) {
      results.push(await runLighthouseForPage(page));
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
    await new Promise((resolve, reject) => {
      server.httpServer.close((error) => (error ? reject(error) : resolve()));
      server.httpServer.closeAllConnections();
    });
  }
}

main().catch((error) => {
  console.error('Unable to run Lighthouse smoke checks.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
