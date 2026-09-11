import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fg from 'fast-glob';
import { PRODUCT_MASTER_ROOT } from '../tools/image-optimizer/product-sources.mjs';
import { discoverHtml, assertNoTemplateArtifacts } from './html.mjs';
import { validateCsp } from './csp.mjs';

const HASHED_BUNDLE = /^build\/.+-[\w-]{8,}\.(?:js|css)$/;
const ORIGIN = 'https://volt-garage.invalid';

async function validatePackage(root, dist) {
  const errors = [];
  const files = new Set(fg.sync('**/*', { cwd: dist, dot: true, onlyFiles: true }));
  const requireFile = (file, source) => {
    if (!files.has(file)) errors.push(`${source}: missing output ${file}`);
  };
  const checkUrl = (value, source) => {
    if (!value || value.startsWith('#') || value.startsWith('?')) return;
    const url = new URL(value.replaceAll('&amp;', '&'), `${ORIGIN}/${source}`);
    if (url.origin !== ORIGIN) return;
    const file = decodeURIComponent(url.pathname).slice(1) || 'index.html';
    requireFile(file.endsWith('/') ? `${file}index.html` : file, source);
  };
  const pages = discoverHtml(root);
  const documents = new Map();
  for (const file of pages) {
    requireFile(file, 'HTML entry');
    if (!files.has(file)) continue;
    const content = await fs.readFile(path.join(dist, file), 'utf8');
    documents.set(file, content);
    try {
      assertNoTemplateArtifacts(content, file);
    } catch (error) {
      errors.push(error.message);
    }
    if (/(?:css\/main\.css|js\/main\.js|[\w.-]+\.min\.(?:css|js))\b/.test(content)) {
      errors.push(`${file}: source or legacy minified asset reference`);
    }
    const generated = [];
    for (const match of content.matchAll(/\b(?:href|src|action|poster)\s*=\s*["']([^"']*)["']/gi)) {
      checkUrl(match[1], file);
      if (match[1].startsWith('/build/')) generated.push(match[1].slice(1));
    }
    for (const match of content.matchAll(/\b(?:srcset|imagesrcset)\s*=\s*["']([^"']*)["']/gi)) {
      for (const candidate of match[1].split(',')) checkUrl(candidate.trim().split(/\s+/)[0], file);
    }
    // Every existing entry uses the common CSS and ES module entry.
    for (const extension of ['.css', '.js']) {
      if (!generated.some((asset) => asset.endsWith(extension) && HASHED_BUNDLE.test(asset))) {
        errors.push(`${file}: missing content-hashed ${extension} bundle reference`);
      }
    }
  }
  for (const file of files) {
    if (file.endsWith('.html') && !documents.has(file)) {
      documents.set(file, await fs.readFile(path.join(dist, file), 'utf8'));
    }
  }
  // Inspect final HTML and the actual shipped policy, not source approximations.
  if (files.has('_headers')) {
    errors.push(
      ...(await validateCsp(await fs.readFile(path.join(dist, '_headers'), 'utf8'), documents))
    );
  }
  const publicFiles = fg.sync('**/*', {
    cwd: path.join(root, 'public'),
    dot: true,
    onlyFiles: true,
  });
  for (const file of publicFiles) {
    if (
      file.startsWith('build/') ||
      file.startsWith('.vite/') ||
      file === 'sw.js' ||
      pages.includes(file)
    ) {
      errors.push(`public/${file}: collides with Vite-owned output`);
    }
    requireFile(file, 'public/');
    if (files.has(file)) {
      const [source, output] = await Promise.all([
        fs.readFile(path.join(root, 'public', file)),
        fs.readFile(path.join(dist, file)),
      ]);
      if (!source.equals(output)) errors.push(`${file}: public file changed during build`);
    }
  }
  for (const file of [
    'sw.js',
    'site.webmanifest',
    'data/products.json',
    'robots.txt',
    'sitemap.xml',
    '_headers',
    '_redirects',
    '.vite/manifest.json',
  ]) {
    requireFile(file, 'runtime/hosting contract');
  }
  if (files.has('.vite/manifest.json')) {
    const manifest = JSON.parse(await fs.readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
    for (const [key, entry] of Object.entries(manifest)) {
      for (const file of [entry.file, ...(entry.css || []), ...(entry.assets || [])])
        requireFile(file, `Vite manifest ${key}`);
      for (const key of [...(entry.imports || []), ...(entry.dynamicImports || [])]) {
        if (!Object.hasOwn(manifest, key)) errors.push(`Vite manifest: missing import ${key}`);
      }
    }
  }
  for (const file of files) {
    if (/^(?:css|js)\//.test(file) || /\.min\.(?:css|js)$/.test(file)) {
      errors.push(`${file}: legacy source-tree build artifact in output`);
    }
    if (file.startsWith('build/') && /\.(css|js)$/.test(file) && !HASHED_BUNDLE.test(file)) {
      errors.push(`${file}: bundle filename has no content hash`);
    }
    if (file.endsWith('.css')) {
      const content = await fs.readFile(path.join(dist, file), 'utf8');
      for (const match of content.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/g))
        checkUrl(match[1], file);
    }
  }
  if (files.has('site.webmanifest')) {
    const manifest = JSON.parse(await fs.readFile(path.join(dist, 'site.webmanifest'), 'utf8'));
    for (const item of [...manifest.icons, ...manifest.screenshots, ...manifest.shortcuts]) {
      if (item.src) checkUrl(item.src, 'site.webmanifest');
      if (item.url) checkUrl(item.url, 'site.webmanifest');
      for (const icon of item.icons || []) checkUrl(icon.src, 'site.webmanifest');
    }
  }
  if (files.has('sw.js') && /__VOLT_/.test(await fs.readFile(path.join(dist, 'sw.js'), 'utf8'))) {
    errors.push('sw.js: unresolved build token');
  }
  // Masters must stay out of deployment, even if accidentally copied under another name.
  const masterHashes = new Map();
  for (const file of fg.sync('**/*', {
    cwd: path.join(root, PRODUCT_MASTER_ROOT),
    onlyFiles: true,
  })) {
    const data = await fs.readFile(path.join(root, PRODUCT_MASTER_ROOT, file));
    if (!masterHashes.has(data.length)) masterHashes.set(data.length, new Set());
    masterHashes.get(data.length).add(createHash('sha256').update(data).digest('hex'));
  }
  for (const file of files) {
    const size = (await fs.stat(path.join(dist, file))).size;
    if (
      file.startsWith(`${PRODUCT_MASTER_ROOT}/`) ||
      (masterHashes.has(size) &&
        masterHashes.get(size).has(
          createHash('sha256')
            .update(await fs.readFile(path.join(dist, file)))
            .digest('hex')
        ))
    ) {
      errors.push(`${file}: full-resolution product master must not be published`);
    }
  }
  if (errors.length)
    throw new Error(`Production package validation failed:\n- ${errors.join('\n- ')}`);
  console.log(
    `Production package validated: ${pages.length} HTML entries, ${publicFiles.length} public files, hashed bundles and PWA resources.`
  );
}

export { validatePackage };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validatePackage(process.cwd(), path.join(process.cwd(), 'dist')).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
