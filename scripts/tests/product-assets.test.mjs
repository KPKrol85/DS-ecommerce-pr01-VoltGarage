import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateProductAssets } from '../validate-product-assets.mjs';

async function fixture(t, catalog, assets) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-product-assets-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'public/data'), { recursive: true });
  await fs.writeFile(path.join(root, 'public/data/products.json'), JSON.stringify(catalog));
  for (const asset of assets) {
    const file = path.join(root, 'public', asset);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '');
  }
  return root;
}

const RASTER = 'assets/images/products/wnetrze-02.png';
const OPTIMIZED = 'assets/images/_optimized/products/wnetrze-02';
const ASSETS = [RASTER, `${OPTIMIZED}.avif`, `${OPTIMIZED}.webp`];
const product = (overrides) => ({
  id: 'interior-mat',
  image: RASTER,
  imageBase: 'wnetrze-02',
  ...overrides,
});

test('a catalog whose declared raster and optimized variants exist validates', async (t) => {
  const root = await fixture(
    t,
    [product(), { id: 'emblem-carbon', image: 'assets/images/products/emblemat-01.jpg' }],
    [...ASSETS, 'assets/images/products/emblemat-01.jpg']
  );
  await validateProductAssets(root);
});

test('a raster declared with the wrong extension fails validation', async (t) => {
  const root = await fixture(
    t,
    [product({ image: 'assets/images/products/wnetrze-02.jpg' })],
    ASSETS
  );
  await assert.rejects(
    validateProductAssets(root),
    /interior-mat .*missing raster image public\/assets\/images\/products\/wnetrze-02\.jpg/
  );
});

test('each declared product asset is individually required', async (t) => {
  for (const [missing, expected] of [
    [RASTER, /missing raster image public\/assets\/images\/products\/wnetrze-02\.png/],
    [`${OPTIMIZED}.avif`, /missing avif variant public\/assets\/images\/_optimized\/products\//],
    [`${OPTIMIZED}.webp`, /missing webp variant public\/assets\/images\/_optimized\/products\//],
  ]) {
    const root = await fixture(
      t,
      [product()],
      ASSETS.filter((asset) => asset !== missing)
    );
    await assert.rejects(validateProductAssets(root), expected);
  }
});

test('malformed catalog entries fail instead of being skipped', async (t) => {
  for (const [catalog, expected] of [
    ['not-an-array', /expected an array of products/],
    [[null], /catalog entry is not an object/],
    [[{ image: RASTER }], /missing product id/],
    [[product({ image: '' })], /"image" must be a public asset path/],
    [[product({ image: `/${RASTER}` })], /"image" must be a public asset path/],
    [
      [product({ image: 'https://cdn.example.invalid/wnetrze-02.png' })],
      /"image" must be a public asset path/,
    ],
    [
      [product({ imageBase: '../products/wnetrze-02' })],
      /"imageBase" must be a bare file base name/,
    ],
    [[product({ imageBase: '' })], /"imageBase" must be a bare file base name/],
  ]) {
    const root = await fixture(t, catalog, ASSETS);
    await assert.rejects(validateProductAssets(root), expected);
  }
});

test('every missing asset in the catalog is reported in one run', async (t) => {
  const root = await fixture(
    t,
    [
      product(),
      product({
        id: 'interior-cover',
        image: 'assets/images/products/wnetrze-03.png',
        imageBase: 'wnetrze-03',
      }),
    ],
    []
  );
  await assert.rejects(validateProductAssets(root), (error) => {
    assert.match(error.message, /interior-mat/);
    assert.match(error.message, /interior-cover/);
    assert.equal(error.message.split('\n- ').length - 1, 6);
    return true;
  });
});

test('an unreadable catalog fails validation', async (t) => {
  const root = await fixture(t, [], []);
  await fs.writeFile(path.join(root, 'public/data/products.json'), '{');
  await assert.rejects(validateProductAssets(root), /unreadable catalog/);
});
