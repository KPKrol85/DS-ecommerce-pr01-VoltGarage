import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';
import { initFilters } from '../../js/features/filters.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://volt-garage.invalid';
const SHOP = 'pages/shop.html';
// "all" is the filter's own reset value, not a category the catalog is expected to carry.
const ANY_CATEGORY = 'all';
const CATEGORY_SELECT = /<select\b[^>]*\bid="filter-category"[^>]*>([\s\S]*?)<\/select\s*>/;
const OPTION = /<option\b[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option\s*>/g;
const PRICE_RANGE = /<input\b[^>]*\bid="filter-price"[^>]*>/;
const CATEGORY_CARD =
  /<article\b[^>]*>[\s\S]*?<span class="badge">([\s\S]*?)<\/span>[\s\S]*?href="shop\.html\?([^"]*)"[\s\S]*?<\/article\s*>/g;
const CATEGORY_PILL = /<span class="category-pill">([\s\S]*?)<\/span\s*>/g;
const RENDERED_PRODUCT = /\bdata-product-id="([^"]+)"/g;

const text = (value) =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const render = async (file) =>
  renderHtml(ROOT, file, await fs.readFile(path.join(ROOT, file), 'utf8'));
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))?.[1];

const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/products.json'), 'utf8'));
const catalogCategories = [...new Set(catalog.map((product) => product.category))];

const shopMarkup = await render(SHOP);
const filterOptions = [...shopMarkup.match(CATEGORY_SELECT)[1].matchAll(OPTION)].map((match) => ({
  value: match[1],
  label: text(match[2]),
}));
const filterCategories = filterOptions
  .map((option) => option.value)
  .filter((value) => value !== ANY_CATEGORY);
// The arrival experience is the shop's own resting state, so the filter runs at its default cap.
const defaultPriceCap = Number(attribute(shopMarkup.match(PRICE_RANGE)[0], 'value'));

// A collection card is the label a visitor reads paired with the filtered shop it opens.
const collectionCards = [...(await render('pages/collections.html')).matchAll(CATEGORY_CARD)]
  .map((match) => ({
    label: text(match[1]),
    category: new URLSearchParams(match[2]).get('category'),
  }))
  .filter((card) => card.category !== null);

const homepagePills = [...(await render('index.html')).matchAll(CATEGORY_PILL)].map((match) =>
  text(match[1])
);

const inCategory = (category) =>
  catalog
    .filter((product) => product.category === category && product.price <= defaultPriceCap)
    .map((product) => product.id);

// The runtime is exercised through the real filter module against the shipped catalog, with only
// the browser surfaces it reads replaced, so the assertions describe what a visitor is shown.
async function openShop(search) {
  const grid = {
    innerHTML: '',
    setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} },
  };
  const categorySelect = {
    value: ANY_CATEGORY,
    options: filterOptions.map(({ value }) => ({ value })),
    addEventListener() {},
  };
  const priceRange = { value: String(defaultPriceCap), addEventListener() {} };
  const resultCount = { textContent: '', setAttribute() {} };
  const jsonLd = [];
  const nodes = {
    '[data-products="shop"]': grid,
    '#filter-category': categorySelect,
    '#filter-price': priceRange,
    '[data-price-output]': { textContent: '' },
    '#filter-sort': { value: 'featured', addEventListener() {} },
    '[data-result-count]': resultCount,
  };
  globalThis.window = {
    location: {
      pathname: `/${SHOP}`,
      search,
      origin: ORIGIN,
      href: `${ORIGIN}/${SHOP}${search}`,
    },
  };
  globalThis.document = {
    baseURI: `${ORIGIN}/${SHOP}`,
    head: { querySelector: () => null, appendChild: (script) => jsonLd.push(script) },
    createElement: () => ({ dataset: {} }),
    querySelector: (selector) => nodes[selector] ?? null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => catalog });
  await initFilters();
  return {
    selected: categorySelect.value,
    shown: [...grid.innerHTML.matchAll(RENDERED_PRODUCT)].map((match) => match[1]),
    count: resultCount.textContent,
    listed: JSON.parse(jsonLd.at(-1)?.textContent ?? '{}').numberOfItems ?? 0,
  };
}

test('Detailing is a real catalog category holding the detailing bundle', () => {
  const bundle = catalog.find((product) => product.id === 'bundle-detail');
  assert.ok(bundle, 'the detailing bundle should still be in the catalog');
  assert.equal(bundle.category, 'Detailing');
  assert.ok(
    catalogCategories.includes('Detailing'),
    'the catalog should carry a Detailing category'
  );
  for (const category of catalogCategories) {
    assert.equal(typeof category, 'string');
    assert.ok(category.trim(), 'a catalog product carries a blank category');
  }
});

test('the shop filter offers exactly the categories the catalog contains', () => {
  assert.equal(filterOptions[0]?.value, ANY_CATEGORY, 'the filter should keep its reset option');
  assert.deepEqual(
    [...filterCategories].sort(),
    [...catalogCategories].sort(),
    'every catalog category must be filterable, and no filter option may advertise an empty category'
  );
  assert.ok(filterCategories.includes('Detailing'), '#filter-category should offer Detailing');
  for (const option of filterOptions) {
    assert.equal(option.value === ANY_CATEGORY ? option.value : option.label, option.value);
  }
});

test('every collection card opens a filtered shop that its own label describes', () => {
  assert.ok(collectionCards.length > 1, 'the collections page should offer category cards');
  for (const { label, category } of collectionCards) {
    assert.ok(
      catalogCategories.includes(category),
      `"${label}" links to absent category ${category}`
    );
    assert.ok(filterCategories.includes(category), `"${label}" links to unfilterable ${category}`);
    assert.equal(category, label, `the "${label}" card opens the ${category} shop`);
  }
});

test('no two collection cards resolve to the same filtered shop', () => {
  const destinations = collectionCards.map((card) => card.category);
  assert.equal(
    new Set(destinations).size,
    destinations.length,
    `two collection cards share a destination: ${destinations.join(', ')}`
  );
  const destination = (label) => collectionCards.find((card) => card.label === label)?.category;
  assert.equal(destination('Gadżety'), 'Gadżety');
  assert.equal(destination('Detailing'), 'Detailing');
  assert.notEqual(destination('Gadżety'), destination('Detailing'));
});

test('every homepage category pill names a real catalog and filter category', () => {
  assert.ok(homepagePills.length > 1, 'the homepage should present its category pills');
  for (const pill of homepagePills) {
    assert.ok(catalogCategories.includes(pill), `the "${pill}" pill names no catalog category`);
    assert.ok(filterCategories.includes(pill), `the "${pill}" pill names no filter category`);
  }
  assert.ok(homepagePills.includes('Detailing'), 'the Detailing pill should survive the change');
});

test('arriving from a collection card shows that category and nothing else', async () => {
  for (const category of filterCategories) {
    const expected = inCategory(category);
    assert.ok(expected.length, `${category}: an advertised category should have products`);
    const page = await openShop(`?category=${encodeURIComponent(category)}`);
    assert.equal(page.selected, category, `${category}: the filter did not resolve the parameter`);
    assert.deepEqual(
      [...page.shown].sort(),
      [...expected].sort(),
      `${category}: the rendered products are not this category's products`
    );
    assert.equal(page.count, `${expected.length} produktów`);
    assert.equal(
      page.listed,
      expected.length,
      `${category}: the item list disagrees with the grid`
    );
  }
});

// The two categories that used to resolve to one filtered result.
test('Gadżety and Detailing no longer resolve to the same products', async () => {
  const gadgets = await openShop('?category=Gadżety');
  const detailing = await openShop('?category=Detailing');
  assert.ok(!gadgets.shown.includes('bundle-detail'), 'the bundle left Gadżety');
  assert.deepEqual(detailing.shown, ['bundle-detail'], 'Detailing shows the detailing bundle');
  assert.ok(gadgets.shown.length, 'Gadżety keeps its remaining products');
  assert.equal(
    gadgets.shown.filter((id) => detailing.shown.includes(id)).length,
    0,
    'the two categories still overlap'
  );
});
