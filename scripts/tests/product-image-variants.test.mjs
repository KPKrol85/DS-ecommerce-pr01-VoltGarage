import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductAssets } from '../validate-product-assets.mjs';
import { hasOptimizedVariants } from '../../js/core/product-images.js';
import { getProductImage, initProductDetails, renderGrid } from '../../js/features/products.js';
import { initCartPage } from '../../js/features/cart.js';
import { toAbsolute } from '../../js/ui/structured-data.js';
import { safeStorage } from '../../js/services/storage.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const publicDir = path.join(repoRoot, 'public');
const catalog = JSON.parse(await fs.readFile(path.join(publicDir, 'data/products.json'), 'utf8'));

const ORIGIN = 'https://e-commerce-pr01-voltgarage.netlify.app';

// The product image URLs the storefront published before the catalog carried a second
// optimized-base field, recorded from the rendered markup of the previous implementation. Each
// one is a live public URL, so a diff here is a change to the deployed site, not a refactor.
const PUBLISHED = {
  'emblem-carbon': {
    raster: 'assets/images/products/emblemat-01.jpg',
    avif: 'assets/images/_optimized/products/emblemat-01.avif',
    webp: 'assets/images/_optimized/products/emblemat-01.webp',
  },
  'emblem-steel': {
    raster: 'assets/images/products/emblemat-02.jpg',
    avif: 'assets/images/_optimized/products/emblemat-02.avif',
    webp: 'assets/images/_optimized/products/emblemat-02.webp',
  },
  'sticker-track': {
    raster: 'assets/images/products/naklejka-01.jpg',
    avif: 'assets/images/_optimized/products/naklejka-01.avif',
    webp: 'assets/images/_optimized/products/naklejka-01.webp',
  },
  'sticker-night': {
    raster: 'assets/images/products/naklejka-02.png',
    avif: 'assets/images/_optimized/products/naklejka-02.avif',
    webp: 'assets/images/_optimized/products/naklejka-02.webp',
  },
  'gadget-hub': {
    raster: 'assets/images/products/gadget-01.png',
    avif: 'assets/images/_optimized/products/gadget-01.avif',
    webp: 'assets/images/_optimized/products/gadget-01.webp',
  },
  'gadget-cam': {
    raster: 'assets/images/products/gadget-02.png',
    avif: 'assets/images/_optimized/products/gadget-02.avif',
    webp: 'assets/images/_optimized/products/gadget-02.webp',
  },
  'interior-ambient': {
    raster: 'assets/images/products/wnetrze-01.png',
    avif: 'assets/images/_optimized/products/wnetrze-01.avif',
    webp: 'assets/images/_optimized/products/wnetrze-01.webp',
  },
  'interior-mat': {
    raster: 'assets/images/products/wnetrze-02.png',
    avif: 'assets/images/_optimized/products/wnetrze-02.avif',
    webp: 'assets/images/_optimized/products/wnetrze-02.webp',
  },
  'exterior-wing': {
    raster: 'assets/images/products/zewnetrzne-01.png',
    avif: 'assets/images/_optimized/products/zewnetrzne-01.avif',
    webp: 'assets/images/_optimized/products/zewnetrzne-01.webp',
  },
  'exterior-guard': {
    raster: 'assets/images/products/zewnetrzne-02.png',
    avif: 'assets/images/_optimized/products/zewnetrzne-02.avif',
    webp: 'assets/images/_optimized/products/zewnetrzne-02.webp',
  },
  'bundle-detail': {
    raster: 'assets/images/products/gadget-03.png',
    avif: 'assets/images/_optimized/products/gadget-03.avif',
    webp: 'assets/images/_optimized/products/gadget-03.webp',
  },
  'interior-cover': {
    raster: 'assets/images/products/wnetrze-03.png',
    avif: 'assets/images/_optimized/products/wnetrze-03.avif',
    webp: 'assets/images/_optimized/products/wnetrze-03.webp',
  },
};

// The three entries the previous validator walked past, because they declared no optimized-base
// field for it to key on.
const FORMERLY_UNVALIDATED = ['emblem-carbon', 'emblem-steel', 'sticker-track'];

const ALL_PUBLISHED_ASSETS = Object.values(PUBLISHED).flatMap(({ raster, avif, webp }) => [
  raster,
  avif,
  webp,
]);

// Only the location fields and the container the product modules actually reach for.
function mount(t, pageUrl, selectors = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });
  const url = new URL(pageUrl);
  globalThis.window = {
    location: { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search },
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    dispatchEvent() {},
  };
  globalThis.document = {
    baseURI: url.href,
    querySelector: (selector) => selectors[selector] ?? null,
    querySelectorAll: () => [],
    head: { querySelector: () => null, appendChild() {} },
    createElement: () => ({ dataset: {}, textContent: '' }),
  };
}

const container = () => ({
  innerHTML: '',
  setAttribute() {},
  addEventListener() {},
  classList: { toggle() {}, add() {}, remove() {} },
});

const readPicture = (html) => ({
  img: html.match(/<img src="([^"]+)"/)?.[1],
  sources: [...html.matchAll(/<source srcset="([^"]+)" type="image\/(avif|webp)" \/>/g)].map(
    (match) => [match[2], match[1]]
  ),
});

// A directory listing per segment keeps the check case-exact on a case-insensitive filesystem.
async function assertPublishedFile(relativePath) {
  let directory = publicDir;
  for (const segment of relativePath.split('/')) {
    assert.ok(
      (await fs.readdir(directory)).includes(segment),
      `Missing public/${relativePath} (exact case)`
    );
    directory = path.join(directory, segment);
  }
  assert.ok((await fs.stat(directory)).isFile(), `public/${relativePath}: expected a file`);
}

async function catalogFixture(t, assets) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-product-image-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'public/data'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'public/data/products.json'),
    JSON.stringify(catalog, null, 2)
  );
  for (const asset of assets) {
    const file = path.join(root, 'public', asset);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '');
  }
  return root;
}

test('the catalog declares one image per product and no second optimized-base field', () => {
  assert.equal(catalog.length, 12);
  assert.deepEqual(
    catalog.map((product) => product.id),
    Object.keys(PUBLISHED)
  );
  for (const product of catalog) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(product, 'imageBase'),
      false,
      `${product.id}: optimized variants are derived from "image", so "imageBase" is redundant`
    );
    assert.equal(product.image, PUBLISHED[product.id].raster, product.id);
    assert.ok(
      hasOptimizedVariants(product.image),
      `${product.id}: "image" must be a raster the optimizer mirrors`
    );
  }
});

test('product cards publish the recorded raster, AVIF and WebP URLs at both depths', (t) => {
  for (const [page, prefix] of [
    ['index.html', ''],
    ['pages/shop.html', '../'],
    ['pages/new-arrivals.html', '../'],
  ]) {
    mount(t, `${ORIGIN}/${page}`);
    const grid = container();
    renderGrid(grid, catalog);
    const cards = grid.innerHTML.split('<article').slice(1);
    assert.equal(cards.length, catalog.length, page);
    cards.forEach((card, index) => {
      const { id } = catalog[index];
      const expected = PUBLISHED[id];
      const { img, sources } = readPicture(card);
      assert.equal(img, `${prefix}${expected.raster}`, `${page} ${id} raster`);
      assert.deepEqual(
        sources,
        [
          ['avif', `${prefix}${expected.avif}`],
          ['webp', `${prefix}${expected.webp}`],
        ],
        `${page} ${id} optimized sources`
      );
    });
  }
});

test('product details publish the same picture URLs the card publishes', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async () => ({ ok: true, json: async () => catalog });

  for (const product of catalog) {
    const media = container();
    mount(t, `${ORIGIN}/pages/product.html?id=${product.id}`, {
      '[data-product-details]': media,
    });
    await initProductDetails();
    const expected = PUBLISHED[product.id];
    const { img, sources } = readPicture(media.innerHTML);
    assert.equal(img, `../${expected.raster}`, `${product.id} detail raster`);
    assert.deepEqual(
      sources,
      [
        ['avif', `../${expected.avif}`],
        ['webp', `../${expected.webp}`],
      ],
      `${product.id} detail optimized sources`
    );
    // The eager product-media picture is the only difference from a card picture.
    assert.match(media.innerHTML, /loading="eager"/);
  }
});

test('every published product image URL resolves to a file with exact case', async () => {
  assert.equal(ALL_PUBLISHED_ASSETS.length, 36);
  for (const asset of ALL_PUBLISHED_ASSETS) {
    await assertPublishedFile(asset);
  }
});

test('validation covers the raster and both optimized variants of all twelve products', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (message) => lines.push(String(message)));
  await validateProductAssets(repoRoot);
  assert.deepEqual(lines, [
    'Product asset validation passed: 12 catalog entries, 12 raster images, 24 optimized variants.',
  ]);
});

test('a catalog holding exactly the rendered URLs validates, and every one of them is required', async (t) => {
  await validateProductAssets(await catalogFixture(t, ALL_PUBLISHED_ASSETS));

  for (const id of FORMERLY_UNVALIDATED) {
    for (const format of ['avif', 'webp']) {
      const withheld = PUBLISHED[id][format];
      const root = await catalogFixture(
        t,
        ALL_PUBLISHED_ASSETS.filter((asset) => asset !== withheld)
      );
      await assert.rejects(
        validateProductAssets(root),
        new RegExp(
          `${id} \\(entry #\\d+\\): missing ${format} variant public/${withheld.replace(/[.]/g, '\\.')}`
        ),
        `${id} ${format} must be required`
      );
    }

    const raster = PUBLISHED[id].raster;
    const root = await catalogFixture(
      t,
      ALL_PUBLISHED_ASSETS.filter((asset) => asset !== raster)
    );
    await assert.rejects(
      validateProductAssets(root),
      new RegExp(`${id} \\(entry #\\d+\\): missing raster image public/${raster.replace(/[.]/g, '\\.')}`),
      `${id} raster must stay required`
    );
  }
});

test('structured-data image URLs still resolve to the raster fallback', (t) => {
  mount(t, `${ORIGIN}/pages/shop.html`);
  for (const product of catalog) {
    const absolute = toAbsolute(getProductImage(product.image));
    assert.equal(absolute, `${ORIGIN}/${PUBLISHED[product.id].raster}`, product.id);
    assert.ok(!absolute.includes('_optimized'), `${product.id}: JSON-LD must not cite a variant`);
  }
});

test('the cart line item keeps the raster image and renders no optimized source', async (t) => {
  const items = container();
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async () => ({ ok: true, json: async () => catalog });
  const stored = JSON.stringify(FORMERLY_UNVALIDATED.map((id) => ({ id, qty: 1 })));
  t.mock.method(safeStorage, 'get', () => stored);
  mount(t, `${ORIGIN}/pages/cart.html`, { '[data-cart-items]': items });

  await initCartPage();

  assert.ok(!items.innerHTML.includes('<picture'), 'the cart renders a plain <img>');
  assert.ok(!items.innerHTML.includes('_optimized'), 'the cart renders no optimized variant');
  const rendered = [...items.innerHTML.matchAll(/<img src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(
    rendered,
    FORMERLY_UNVALIDATED.map((id) => `../${PUBLISHED[id].raster}`)
  );
});
