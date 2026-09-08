import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverHtml, renderHtml } from '../html.mjs';
import { validatePackage } from '../validate-package.mjs';

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-build-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await fs.writeFile(path.join(root, name), content);
    })
  );
  return root;
}

test('entry discovery includes every root/pages document and excludes partials and public HTML', async (t) => {
  const root = await fixture(t, {
    'index.html': '',
    'new-entry.html': '',
    'pages/shop.html': '',
    'pages/nested/detail.html': '',
    'src/partials/header.html': '',
    'public/example.html': '',
    'dist/index.html': '',
  });
  assert.deepEqual(discoverHtml(root), [
    'index.html',
    'new-entry.html',
    'pages/nested/detail.html',
    'pages/shop.html',
  ]);
});

test('shared includes retain context, nested includes, and both conditional branches', async (t) => {
  const root = await fixture(t, {
    'src/partials/header.html':
      '<a href="{{rootPrefix}}index.html">{{#if isHomePage}}Home{{else}}{{#if isPagesDir}}Page{{else}}Root{{/if}}{{/if}}</a><!-- @include links.html -->',
    'src/partials/links.html': '<a href="{{pagesPrefix}}shop.html">Shop</a>',
  });
  const source = '<!-- @include src/partials/header.html -->';
  assert.equal(
    await renderHtml(root, 'index.html', source),
    '<a href="index.html">Home</a><a href="pages/shop.html">Shop</a>'
  );
  assert.equal(
    await renderHtml(root, 'pages/shop.html', source),
    '<a href="../index.html">Page</a><a href="shop.html">Shop</a>'
  );
  assert.equal(
    await renderHtml(root, 'thank-you.html', source),
    '<a href="index.html">Root</a><a href="pages/shop.html">Shop</a>'
  );
  // The fallback documents are served at the URL that failed, so they link from the root.
  for (const fallback of ['404.html', 'offline.html']) {
    assert.equal(
      await renderHtml(root, fallback, source),
      '<a href="/index.html">Root</a><a href="/pages/shop.html">Shop</a>'
    );
  }
  assert.equal(
    await renderHtml(root, 'pages/nested/detail.html', source),
    '<a href="../../index.html">Page</a><a href="../shop.html">Shop</a>'
  );
});

test('invalid includes, cycles, unknown and malformed template instructions fail clearly', async (t) => {
  const root = await fixture(t, {
    'src/partials/loop.html': '<!-- @include loop.html -->',
    'outside.html': 'outside',
  });
  for (const [source, expected] of [
    ['<!-- @include src/partials/loop.html -->', /Circular include/],
    ['<!-- @include outside.html -->', /Invalid include path/],
    ['<!-- @include src/partials/absent.html -->', /ENOENT/],
    ['{{unknown}}', /Unknown template token/],
    ['{{#if unknown}}yes{{/if}}', /Unknown template token/],
    ['{{#if isPagesDir}}{{unknown}}{{/if}}', /Unknown template token/],
    ['{{#if isHomePage}}', /Unclosed/],
    ['{{else}}', /Unexpected/],
    ['{{#if isHomePage}}yes{{else}}no{{else}}again{{/if}}', /Unexpected/],
    ['<!-- @include -->', /unresolved/],
    ['{{broken', /unresolved/],
  ]) {
    await assert.rejects(renderHtml(root, 'index.html', source), expected);
  }
});

test('package validation rejects missing bundles, public files, source URLs, and template artifacts', async (t) => {
  const page =
    '<link rel="stylesheet" href="/build/main-abcdefgh.css"><script type="module" src="/build/main-abcdefgh.js"></script>';
  const manifest = JSON.stringify({ icons: [], screenshots: [], shortcuts: [] });
  const publicFiles = {
    'site.webmanifest': manifest,
    'data/products.json': '[]',
    'robots.txt': '',
    'sitemap.xml': '',
    _headers: "/*\n  Content-Security-Policy: script-src 'self'\n",
    _redirects: '',
  };
  const root = await fixture(t, {
    'index.html': 'source',
    'output/index.html': page,
    'output/build/main-abcdefgh.css': '',
    'output/build/main-abcdefgh.js': '',
    'output/sw.js': '',
    'output/.vite/manifest.json': '{}',
    ...Object.fromEntries(
      Object.entries(publicFiles).flatMap(([file, content]) => [
        [`public/${file}`, content],
        [`output/${file}`, content],
      ])
    ),
  });
  const dist = path.join(root, 'output');
  await validatePackage(root, dist);
  for (const content of [
    page + '{{unknown}}',
    page + '<script>window.unapproved = true;</script>',
    page + '<img src="/missing.png">',
    page.replace('/build/main-abcdefgh.js', '/js/main.js'),
    page.replace('/build/main-abcdefgh.css', '/css/main.min.css'),
  ]) {
    await fs.writeFile(path.join(dist, 'index.html'), content);
    await assert.rejects(validatePackage(root, dist), /Production package validation failed/);
  }
  await fs.writeFile(path.join(dist, 'index.html'), page);
  await fs.unlink(path.join(dist, 'build/main-abcdefgh.js'));
  await assert.rejects(validatePackage(root, dist), /missing output build/);
  await fs.writeFile(path.join(dist, 'build/main-abcdefgh.js'), '');
  await fs.unlink(path.join(dist, 'data/products.json'));
  await assert.rejects(validatePackage(root, dist), /missing output data/);
});
