import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import fg from 'fast-glob';
import sharp from 'sharp';
import {
  PRODUCT_MASTER_ROOT,
  PRODUCT_RASTER_ROOT,
  PRODUCT_FALLBACK_SIZE,
  resolveImageSource,
} from '../../tools/image-optimizer/product-sources.mjs';
import { resizeProductFallbacks } from '../../tools/image-optimizer/resize-product-fallbacks.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const optimizer = path.join(root, 'tools/image-optimizer/optimize-images.mjs');
const run = promisify(execFile);
const raster = `${PRODUCT_RASTER_ROOT}/example.png`;
const master = `${PRODUCT_MASTER_ROOT}/example.png`;
const digest = (data) => createHash('sha256').update(data).digest('hex');

async function snapshot(directory) {
  const files = await fg('**/*', { cwd: directory, dot: true, onlyFiles: true });
  return Promise.all(
    files.sort().map(async (file) => [file, digest(await fs.readFile(path.join(directory, file)))])
  );
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-product-source-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [file, width, height, background] of [
    [master, 48, 32, 'blue'],
    [raster, 12, 8, 'red'],
    ['public/assets/images/hero/example.png', 24, 16, 'green'],
    ['custom/outside.png', 20, 10, 'yellow'],
  ]) {
    const destination = path.join(directory, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await sharp({ create: { width, height, channels: 3, background } })
      .png()
      .toFile(destination);
  }
  await fs.mkdir(path.join(directory, 'public/data'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'public/data/products.json'),
    JSON.stringify([{ id: 'example', image: 'assets/images/products/example.png' }])
  );
  return directory;
}

const optimize = (directory, ...args) =>
  run(process.execPath, [optimizer, '--only=all', '--effort-avif=0', ...args], { cwd: directory });

test('catalog masters are retained outside public and fallbacks obey the measured size policy', async () => {
  const catalog = JSON.parse(
    await fs.readFile(path.join(root, 'public/data/products.json'), 'utf8')
  );
  const expected = catalog.map(({ image }) => path.basename(image)).sort();
  assert.equal(expected.length, 12);
  assert.deepEqual((await fs.readdir(path.join(root, PRODUCT_MASTER_ROOT))).sort(), expected);
  assert.deepEqual((await fs.readdir(path.join(root, PRODUCT_RASTER_ROOT))).sort(), expected);
  const masterHashes = new Set();
  for (const { image } of catalog) {
    const { inputPath, relativePath } = resolveImageSource(root, `public/${image}`);
    assert.ok(inputPath.startsWith(path.join(root, PRODUCT_MASTER_ROOT) + path.sep));
    assert.equal(relativePath.replaceAll('\\', '/'), image.slice('assets/images/'.length));
    const source = await sharp(inputPath).metadata();
    const published = await sharp(path.join(root, 'public', image)).metadata();
    assert.equal(published.format, source.format, image);
    assert.ok(
      source.width >= 1024 && source.height >= 1024,
      `${image}: retain full-resolution master`
    );
    assert.ok(published.width <= PRODUCT_FALLBACK_SIZE.width, `${image}: fallback width`);
    assert.ok(published.height <= PRODUCT_FALLBACK_SIZE.height, `${image}: fallback height`);
    assert.ok(
      published.width < source.width && published.height < source.height,
      `${image}: reduced fallback`
    );
    assert.equal(
      published.width / published.height,
      source.width / source.height,
      `${image}: no crop`
    );
    masterHashes.add(digest(await fs.readFile(inputPath)));
  }
  // Catch duplicate masters anywhere under public, including renamed assets.
  for (const [, hash] of await snapshot(path.join(root, 'public'))) {
    assert.ok(!masterHashes.has(hash), 'a full-resolution product master is under public/');
  }
});

test('public and master input paths map to identical optimized product paths; other roots stay unchanged', () => {
  assert.deepEqual(resolveImageSource(root, raster), resolveImageSource(root, master));
  assert.deepEqual(resolveImageSource(root, 'public/assets/images/hero/example.jpg'), {
    inputPath: path.join(root, 'public/assets/images/hero/example.jpg'),
    relativePath: path.join('hero', 'example.jpg'),
    outsideRoot: false,
  });
  assert.deepEqual(resolveImageSource(root, 'custom/example.jpg'), {
    inputPath: path.join(root, 'custom/example.jpg'),
    relativePath: 'example.jpg',
    outsideRoot: true,
  });
});

test('optimizer default discovery uses masters even without published fallbacks and keeps hero output', async (t) => {
  const directory = await fixture(t);
  await fs.unlink(path.join(directory, raster));
  const { stdout } = await optimize(directory);
  assert.match(stdout, /Sources found: 2/);
  for (const [name, width, height] of [
    ['products/example', 48, 32],
    ['hero/example', 24, 16],
  ]) {
    for (const ext of ['webp', 'avif']) {
      const metadata = await sharp(
        await fs.readFile(path.join(directory, `public/assets/images/_optimized/${name}.${ext}`))
      ).metadata();
      assert.deepEqual([metadata.width, metadata.height], [width, height]);
    }
  }
  await assert.rejects(fs.stat(path.join(directory, raster)), { code: 'ENOENT' });
});

test('public globs read masters, direct master globs keep output mapping, and discovery deduplicates', async (t) => {
  const directory = await fixture(t);
  // An undecodable fallback must not affect optimized generation at all.
  await fs.writeFile(path.join(directory, raster), 'not a source image');
  for (const [glob, out] of [
    ['public/assets/images/products/*.png', 'from-public'],
    [`${PRODUCT_MASTER_ROOT}/*.png`, 'from-master'],
  ]) {
    await optimize(directory, `--glob=${glob}`, '--mode=output', `--out=${out}`);
    for (const ext of ['webp', 'avif']) {
      const m = await sharp(
        await fs.readFile(path.join(directory, out, `products/example.${ext}`))
      ).metadata();
      assert.deepEqual([m.width, m.height], [48, 32]);
    }
  }
  const { stdout } = await optimize(directory, '--dry-run');
  assert.match(stdout, /Sources found: 2/);
  const outside = await optimize(
    directory,
    '--glob=custom/*.png',
    '--mode=output',
    '--out=external'
  );
  assert.match(outside.stdout, /Warnings: 1/);
  assert.equal(
    (await sharp(await fs.readFile(path.join(directory, 'external/outside.webp'))).metadata())
      .width,
    20
  );
});

test('optimizer and fallback dry-runs leave all files unchanged and create no output directory', async (t) => {
  const directory = await fixture(t);
  const before = await snapshot(directory);
  const { stdout } = await optimize(directory, '--dry-run', '--mode=output', '--out=dry-output');
  assert.match(stdout, /Sources found: 2/);
  assert.match(stdout, /WebP generated: 2/);
  assert.match(stdout, /AVIF generated: 2/);
  t.mock.method(console, 'log', () => {});
  await resizeProductFallbacks(directory, { dryRun: true });
  assert.deepEqual(await snapshot(directory), before);
  await assert.rejects(fs.stat(path.join(directory, 'dry-output')), { code: 'ENOENT' });
});

test('missing product master fails generation instead of using the reduced fallback', async (t) => {
  const directory = await fixture(t);
  await fs.unlink(path.join(directory, master));
  const before = await snapshot(directory);
  await assert.rejects(
    optimize(directory, '--glob=public/assets/images/products/*.png'),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /ENOENT/);
      return true;
    }
  );
  await assert.rejects(resizeProductFallbacks(directory));
  assert.deepEqual(await snapshot(directory), before);
});

test('fallback regeneration reads the master, preserves it, and produces repeatable output', async (t) => {
  const directory = await fixture(t);
  const original = await fs.readFile(path.join(directory, master));
  t.mock.method(console, 'log', () => {});
  await resizeProductFallbacks(directory);
  const first = await fs.readFile(path.join(directory, raster));
  assert.deepEqual(await fs.readFile(path.join(directory, master)), original);
  const metadata = await sharp(first).metadata();
  assert.deepEqual([metadata.width, metadata.height], [48, 32]);
  const { data } = await sharp(first).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [0, 0, 255]);
  await resizeProductFallbacks(directory);
  assert.deepEqual(await fs.readFile(path.join(directory, raster)), first);
});
