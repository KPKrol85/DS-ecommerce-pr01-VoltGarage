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
  ...overrides,
});

// The JPG products are the ones whose optimized variants validation used to skip, because they
// carried no separate optimized-base field for the check to key on.
const JPG_RASTER = 'assets/images/products/emblemat-01.jpg';
const JPG_OPTIMIZED = 'assets/images/_optimized/products/emblemat-01';
const JPG_ASSETS = [JPG_RASTER, `${JPG_OPTIMIZED}.avif`, `${JPG_OPTIMIZED}.webp`];
const jpgProduct = (overrides) => ({ id: 'emblem-carbon', image: JPG_RASTER, ...overrides });

test('a catalog whose declared raster and optimized variants exist validates', async (t) => {
  const root = await fixture(t, [product(), jpgProduct()], [...ASSETS, ...JPG_ASSETS]);
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

test('the optimized variants of a JPG product are required just as strictly', async (t) => {
  for (const [missing, expected] of [
    [JPG_RASTER, /missing raster image public\/assets\/images\/products\/emblemat-01\.jpg/],
    [
      `${JPG_OPTIMIZED}.avif`,
      /emblem-carbon .*missing avif variant public\/assets\/images\/_optimized\/products\/emblemat-01\.avif \(derived from "image"/,
    ],
    [
      `${JPG_OPTIMIZED}.webp`,
      /emblem-carbon .*missing webp variant public\/assets\/images\/_optimized\/products\/emblemat-01\.webp \(derived from "image"/,
    ],
  ]) {
    const root = await fixture(
      t,
      [jpgProduct()],
      JPG_ASSETS.filter((asset) => asset !== missing)
    );
    await assert.rejects(validateProductAssets(root), expected);
  }
});

test('malformed catalog entries fail instead of being skipped', async (t) => {
  const windowsPath = RASTER.split('/').join('\\');
  for (const [catalog, expected] of [
    ['not-an-array', /expected an array of products/],
    [[null], /catalog entry is not an object/],
    [[{ image: RASTER }], /missing product id/],
    [[product({ image: '' })], /"image" must be a public asset path/],
    [[product({ image: `/${RASTER}` })], /"image" must be a public asset path/],
    [[product({ image: windowsPath })], /"image" must be a public asset path/],
    [
      [product({ image: 'assets/images/../../secrets/key.png' })],
      /"image" must be a public asset path/,
    ],
    [
      [product({ image: 'https://cdn.example.invalid/wnetrze-02.png' })],
      /"image" must be a public asset path/,
    ],
  ]) {
    const root = await fixture(t, catalog, ASSETS);
    await assert.rejects(validateProductAssets(root), expected);
  }
});

test('an image whose optimized variants cannot be derived fails validation', async (t) => {
  for (const image of [
    // Outside the tree the image optimizer mirrors, so no variant can exist for it.
    'data/products.json',
    'assets/icons/shortcuts/shortcut-shop.png',
    // Not a raster the optimizer reads.
    'assets/images/products/wnetrze-02.svg',
    // Already inside the optimizer output, where deriving again would check the file itself.
    'assets/images/_optimized/products/wnetrze-02.png',
  ]) {
    const root = await fixture(t, [product({ image })], ASSETS);
    await assert.rejects(
      validateProductAssets(root),
      /"image" must be a \.jpg, \.jpeg or \.png under assets\/images\/ for its optimized variants to be derivable/
    );
  }
});

test('a leftover imageBase field no longer decides what is validated', async (t) => {
  // Present and agreeing: the entry passes because "image" resolves, not because the stale
  // field does.
  const agreeing = await fixture(t, [product({ imageBase: 'wnetrze-02' })], ASSETS);
  await validateProductAssets(agreeing);

  // Present and pointing somewhere else entirely: the field is ignored, and the variants that
  // "image" derives are still the ones required.
  const disagreeing = await fixture(
    t,
    [product({ imageBase: 'emblemat-01' })],
    [RASTER, ...JPG_ASSETS]
  );
  await assert.rejects(
    validateProductAssets(disagreeing),
    /missing avif variant public\/assets\/images\/_optimized\/products\/wnetrze-02\.avif/
  );
});

test('every missing asset in the catalog is reported in one run', async (t) => {
  const root = await fixture(
    t,
    [
      product(),
      product({
        id: 'interior-cover',
        image: 'assets/images/products/wnetrze-03.png',
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
