const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT_DIR = process.cwd();
const HTML_EXT = '.html';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'src']);
const HREF_REGEX = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const EXCLUDED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'javascript', 'data']);

async function collectHtmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...(await collectHtmlFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(HTML_EXT)) {
      files.push(fullPath);
    }
  }

  return files;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function getHrefValue(match) {
  return (match[1] || match[2] || '').trim();
}

function shouldSkipHref(href) {
  if (!href || href.startsWith('#') || href.startsWith('?') || href.startsWith('//')) {
    return true;
  }

  const schemeMatch = href.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/);
  if (schemeMatch) {
    return EXCLUDED_SCHEMES.has(schemeMatch[1].toLowerCase());
  }

  return false;
}

function createCandidatePaths(targetPath, hasExtension, endsWithSlash) {
  const candidates = [];

  if (endsWithSlash) {
    candidates.push(path.join(targetPath, 'index.html'));
    return candidates;
  }

  candidates.push(targetPath);

  if (!hasExtension) {
    candidates.push(`${targetPath}.html`);
    candidates.push(path.join(targetPath, 'index.html'));
  }

  return candidates;
}

async function resolveExistingTarget(sourceFile, href) {
  const [hrefWithoutFragment] = href.split('#');
  const [cleanHref] = hrefWithoutFragment.split('?');

  if (!cleanHref) {
    return null;
  }

  const isRootRelative = cleanHref.startsWith('/');
  const basePath = isRootRelative
    ? path.resolve(ROOT_DIR, `.${cleanHref}`)
    : path.resolve(path.dirname(sourceFile), cleanHref);

  const hasExtension = Boolean(path.extname(basePath));
  const endsWithSlash = cleanHref.endsWith('/');
  const candidates = createCandidatePaths(basePath, hasExtension, endsWithSlash);

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        return { found: true, resolvedPath: candidate };
      }
    } catch {
      // try next candidate
    }
  }

  return { found: false, candidates };
}

async function validateFileLinks(filePath, content) {
  const errors = [];
  let match;

  while ((match = HREF_REGEX.exec(content)) !== null) {
    const href = getHrefValue(match);

    if (shouldSkipHref(href)) {
      continue;
    }

    const result = await resolveExistingTarget(filePath, href);
    if (!result || result.found) {
      continue;
    }

    const line = getLineNumber(content, match.index);
    const sourceRelPath = path.relative(ROOT_DIR, filePath);
    const resolvedTargets = result.candidates
      .map((candidate) => path.relative(ROOT_DIR, candidate))
      .join(' | ');

    errors.push({
      source: sourceRelPath,
      line,
      href,
      resolvedTargets,
    });
  }

  return errors;
}

async function main() {
  const htmlFiles = await collectHtmlFiles(ROOT_DIR);
  const errors = [];

  for (const filePath of htmlFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    errors.push(...(await validateFileLinks(filePath, content)));
  }

  if (errors.length > 0) {
    console.error('Internal link validation failed:');
    for (const error of errors) {
      console.error(`- ${error.source}:${error.line} -> href="${error.href}"`);
      console.error(`  Resolved target(s): ${error.resolvedTargets}`);
    }
    process.exit(1);
  }

  console.log(`Internal link validation passed for ${htmlFiles.length} HTML files.`);
}

main().catch((error) => {
  console.error('Unable to run internal link validation.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
