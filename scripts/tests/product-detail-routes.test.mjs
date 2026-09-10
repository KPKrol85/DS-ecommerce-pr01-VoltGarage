import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { initProductDetails } from '../../js/features/products.js';

const ROOT = new URL('../../', import.meta.url);
const CATALOG = JSON.parse(await fs.readFile(new URL('public/data/products.json', ROOT), 'utf8'));
const PRODUCT_DOCUMENT = await fs.readFile(new URL('pages/product.html', ROOT), 'utf8');

const ORIGIN = 'https://e-commerce-pr01-voltgarage.netlify.app';
const PRODUCT_PATH = '/pages/product.html';
const NOT_FOUND_MESSAGE = 'Nie znaleziono produktu o podanym identyfikatorze.';
const ABSENT_ID = 'emblem-carbon-2019';

const [FIRST_ENTRY] = CATALOG;
const REQUESTED_ENTRY = CATALOG.find((product) => product.id === 'gadget-cam');
assert.ok(CATALOG.length > 1, 'the catalog no longer holds more than one entry');
assert.ok(REQUESTED_ENTRY, 'the requested fixture product left the catalog');
assert.ok(
  !CATALOG.some((product) => product.id === ABSENT_ID),
  'the fixture id for an absent product is now a real catalog entry'
);

const DESCRIPTION_SELECTORS = {
  'meta[name="description"]': 'description',
  'meta[property="og:description"]': 'ogDescription',
  'meta[name="twitter:description"]': 'twitterDescription',
};

// A route that cannot name a product has to leave this document's own published metadata alone,
// so the fixture starts from the exact neutral values the static product document ships.
const flattened = PRODUCT_DOCUMENT.replace(/\s+/g, ' ');
const declared = (pattern, label) => {
  const match = flattened.match(pattern);
  assert.ok(match, `pages/product.html no longer declares ${label}`);
  return match[1];
};
const STATIC = {
  title: declared(/<title>([^<]+)<\/title>/, 'a title'),
  canonical: declared(/<link rel="canonical" href="([^"]+)"/, 'a canonical link'),
  description: declared(/<meta name="description" content="([^"]+)"/, 'a description'),
  ogDescription: declared(/<meta property="og:description" content="([^"]+)"/, 'an og:description'),
  twitterDescription: declared(
    /<meta name="twitter:description" content="([^"]+)"/,
    'a twitter:description'
  ),
};

// fetchProducts caches the first successful response for the life of the module, so the catalog is
// served once for the file instead of being re-stubbed per case.
globalThis.fetch = async () => ({ ok: true, json: async () => CATALOG });

function attributeNode(initial) {
  const values = { ...initial };
  return {
    getAttribute: (name) => values[name] ?? null,
    setAttribute: (name, value) => {
      values[name] = value;
    },
  };
}

// The detail initializer reads the location, the container, the canonical link, the description
// meta tags, the document title, and the JSON-LD sink in <head>; the harness provides those and
// nothing else, so every assertion below describes the real initializer's own output.
function mountProductPage(t, { search = '' } = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });

  const url = new URL(`${ORIGIN}${PRODUCT_PATH}${search}`);
  const attributes = {};
  const container = {
    innerHTML: '',
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    classList: { add() {}, remove() {}, toggle() {} },
  };
  const canonical = attributeNode({ href: STATIC.canonical });
  const metas = new Map(
    Object.entries(DESCRIPTION_SELECTORS).map(([selector, key]) => [
      selector,
      attributeNode({ content: STATIC[key] }),
    ])
  );
  const scripts = [];
  const head = {
    querySelector: (selector) => {
      const key = selector.match(/data-jsonld-key="([^"]+)"/)?.[1];
      return scripts.find((script) => script.dataset.jsonldKey === key) ?? null;
    },
    appendChild: (script) => scripts.push(script),
  };
  const breadcrumbItem = (href, name) => ({
    textContent: name,
    querySelector: () => (href ? { getAttribute: () => href, textContent: name } : null),
  });
  const breadcrumbs = {
    querySelectorAll: (selector) =>
      selector === 'ol > li'
        ? [
            breadcrumbItem('../index.html', 'Strona główna'),
            breadcrumbItem(null, 'Szczegóły produktu'),
          ]
        : [],
  };
  const doc = {
    baseURI: url.href,
    title: STATIC.title,
    head,
    documentElement: { classList: { add() {} } },
    createElement: (tag) => ({ tagName: tag, dataset: {}, textContent: '' }),
    querySelector: (selector) => {
      if (selector === '[data-product-details]') return container;
      if (selector === 'link[rel="canonical"]') return canonical;
      if (selector === '.breadcrumbs') return breadcrumbs;
      return metas.get(selector) ?? null;
    },
    querySelectorAll: () => [],
  };

  globalThis.window = {
    innerHeight: 800,
    location: { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search },
    matchMedia: () => ({ matches: false }),
  };
  globalThis.document = doc;

  return {
    href: url.href,
    search: url.search,
    get markup() {
      return container.innerHTML;
    },
    get busy() {
      return attributes['aria-busy'];
    },
    get title() {
      return doc.title;
    },
    get canonical() {
      return canonical.getAttribute('href');
    },
    description: (selector) => metas.get(selector).getAttribute('content'),
    jsonLd: (key) => {
      const script = scripts.find((entry) => entry.dataset.jsonldKey === key);
      return script ? JSON.parse(script.textContent) : null;
    },
    get jsonLdText() {
      return scripts.map((entry) => entry.textContent).join('\n');
    },
  };
}

function assertRendersCatalogEntry(page, product) {
  const productUrl = `${ORIGIN}${PRODUCT_PATH}?id=${product.id}`;
  assert.ok(page.markup.includes(product.name), 'the product name was not rendered');
  assert.ok(page.markup.includes(`data-product-id="${product.id}"`), 'add-to-cart lost its id');
  assert.ok(page.markup.includes('data-qty-select'), 'the quantity control was not rendered');
  assert.equal(page.busy, 'false');
  assert.equal(page.canonical, productUrl, 'the canonical link does not name the rendered product');
  assert.equal(page.title, `${product.name} | VOLT GARAGE`);
  for (const selector of Object.keys(DESCRIPTION_SELECTORS)) {
    assert.equal(page.description(selector), product.description, selector);
  }

  const ld = page.jsonLd('product');
  assert.ok(ld, 'no Product JSON-LD was published for a real catalog entry');
  assert.equal(ld['@type'], 'Product');
  // resolvePageUrl keeps a query-bearing request URL as the node identity; that resolution
  // contract is owned elsewhere, so the identity is read from the mounted location.
  const nodeUrl = page.search ? page.href : productUrl;
  assert.equal(ld['@id'], `${nodeUrl}#product`);
  assert.equal(ld.sku, product.id);
  assert.equal(ld.name, product.name);
  assert.equal(ld.url, productUrl);
  assert.equal(ld.offers.url, productUrl);
  assert.equal(ld.offers.price, product.price.toFixed(0));
  assert.deepEqual(ld.image, [`${ORIGIN}/${product.image}`]);
  assert.ok(page.jsonLd('breadcrumb'), 'the page lost its breadcrumb structured data');
}

for (const [label, search] of [
  ['no id', ''],
  ['an explicitly empty id', '?id='],
  ['a blank id', '?id=%20%20'],
]) {
  test(`the product route with ${label} keeps its first-catalog-entry behaviour`, async (t) => {
    const page = mountProductPage(t, { search });

    await initProductDetails();

    assertRendersCatalogEntry(page, FIRST_ENTRY);
  });
}

test('a catalog id renders the requested product under its own canonical and metadata', async (t) => {
  const page = mountProductPage(t, { search: `?id=${REQUESTED_ENTRY.id}` });

  await initProductDetails();

  assert.notEqual(REQUESTED_ENTRY.id, FIRST_ENTRY.id, 'the fixture stopped proving anything');
  assertRendersCatalogEntry(page, REQUESTED_ENTRY);
  assert.ok(
    !page.markup.includes(FIRST_ENTRY.name),
    'the first catalog entry leaked into the page'
  );
  assert.ok(
    !page.jsonLdText.includes(FIRST_ENTRY.id),
    'the first catalog entry leaked into structured data'
  );
});

test('an id absent from the catalog gets a not-found state instead of another product', async (t) => {
  const page = mountProductPage(t, { search: `?id=${ABSENT_ID}` });

  await initProductDetails();

  assert.ok(page.markup.includes(NOT_FOUND_MESSAGE), 'no not-found state was rendered');
  assert.ok(page.markup.includes('state-block--empty'), 'the project state block was not reused');
  assert.ok(page.markup.includes('role="status"'), 'the not-found state is not announced');
  assert.equal(page.busy, 'false', 'the region was left in its loading state');
  assert.ok(!page.markup.includes('data-add-to-cart'), 'an unrelated product stayed buyable');
  assert.ok(!page.markup.includes('data-qty-select'), 'an unrelated product state was rendered');

  for (const product of CATALOG) {
    assert.ok(!page.markup.includes(product.name), `${product.id} was substituted`);
    assert.ok(!page.markup.includes(`data-product-id="${product.id}"`), `${product.id} is buyable`);
    assert.ok(!page.jsonLdText.includes(product.id), `${product.id} reached structured data`);
    assert.ok(!page.jsonLdText.includes(product.name), `${product.id} reached structured data`);
  }

  assert.equal(page.jsonLd('product'), null, 'Product JSON-LD was published for an absent id');
  assert.equal(page.canonical, STATIC.canonical, 'the canonical link was rewritten');
  assert.equal(page.title, STATIC.title, 'the document title was rewritten');
  for (const [selector, key] of Object.entries(DESCRIPTION_SELECTORS)) {
    assert.equal(page.description(selector), STATIC[key], selector);
  }
});
