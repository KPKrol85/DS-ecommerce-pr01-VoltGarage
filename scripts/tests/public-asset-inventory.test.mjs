import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const shortcutDir = 'assets/icons/shortcuts';
const shortcuts = ['shortcut-new.png', 'shortcut-sale.png', 'shortcut-shop.png'];
const heroSizes = ['800x600', '1280x720', '1920x1080'];
// The approved brand set: two theme lockups for the header and footer, the symbol-only badge for
// compact marks, its outline variant for the page-hero watermark, and the square raster the
// storefront's JSON-LD names as the organisation logo. The car-silhouette family this replaced
// shipped the same megabyte of embedded PNG twice, and the worker precaches this whole directory,
// so an exact inventory is what keeps that from creeping back.
const logoDir = 'assets/images/logo';
const logoFiles = [
  'logo-512.png',
  'logo-badge-outline.svg',
  'logo-badge.svg',
  'logo-lockup-dark.svg',
  'logo-lockup-light.svg',
];
const readManifest = async () =>
  JSON.parse(await fs.readFile(path.join(publicDir, 'site.webmanifest'), 'utf8'));

async function assertOnlyFiles(directory, expected) {
  const entries = await fs.readdir(path.join(publicDir, directory), { withFileTypes: true });
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    [...expected].sort(),
    `${directory}: unexpected published inventory`
  );
  for (const entry of entries) {
    assert.ok(entry.isFile(), `${directory}/${entry.name}: expected a file, not a directory`);
  }
}

async function assertPublicFile(relativePath) {
  let directory = publicDir;
  // Check every segment with exact casing, including on Windows.
  for (const segment of relativePath.split('/')) {
    assert.ok((await fs.readdir(directory)).includes(segment), `Missing public/${relativePath}`);
    directory = path.join(directory, segment);
  }
  assert.ok((await fs.stat(directory)).isFile(), `public/${relativePath}: expected a file`);
}

test('shortcuts publish only the three canonical files used by the manifest', async () => {
  await assertOnlyFiles(shortcutDir, shortcuts);
  const manifest = await readManifest();
  assert.deepEqual(
    manifest.shortcuts.flatMap((shortcut) => shortcut.icons.map((icon) => icon.src)).sort(),
    shortcuts.map((file) => `/${shortcutDir}/${file}`).sort()
  );
});

test('the logo directory publishes the approved badge and lockup set only', async () => {
  await assertOnlyFiles(logoDir, logoFiles);
  for (const file of logoFiles) await assertPublicFile(`${logoDir}/${file}`);
});

test('the published hero inventory contains all nine hero-05 variants only', async () => {
  await assertOnlyFiles(
    'assets/images/hero',
    heroSizes.map((size) => `hero-05-${size}.jpg`)
  );
  await assertOnlyFiles(
    'assets/images/_optimized/hero',
    heroSizes.flatMap((size) => ['avif', 'webp'].map((ext) => `hero-05-${size}.${ext}`))
  );
});

test('the exterior product keeps canonical variants without the typo pair', async () => {
  for (const ext of ['avif', 'webp']) {
    await assert.rejects(
      fs.lstat(path.join(publicDir, `assets/images/_optimized/products/zewnetrze-02.${ext}`)),
      { code: 'ENOENT' }
    );
    await assertPublicFile(`assets/images/_optimized/products/zewnetrzne-02.${ext}`);
  }
});

test('known unused OG, favicon and root SVG assets stay unpublished', async () => {
  const removed = [
    'assets/images/og/og-1200x1200.jpg',
    'assets/icons/favicon/favicon-96x96.png',
    ...['bundle', 'emblem', 'exterior', 'gadget', 'interior', 'sticker'].map(
      (name) => `assets/images/${name}.svg`
    ),
  ];
  for (const file of removed) {
    await assert.rejects(fs.lstat(path.join(publicDir, file)), { code: 'ENOENT' }, file);
  }
});

test('every manifest icon, shortcut icon and screenshot resolves to a public file', async () => {
  const manifest = await readManifest();
  const resources = [
    ...manifest.icons,
    ...manifest.shortcuts.flatMap((shortcut) => shortcut.icons),
    ...manifest.screenshots,
  ];
  for (const { src } of resources) {
    assert.match(src, /^\/(?!\/)/, `Expected a root-relative manifest asset: ${src}`);
    assert.ok(!src.split('/').some((segment) => segment === '..' || segment === '.'));
    await assertPublicFile(src.slice(1));
  }
});
