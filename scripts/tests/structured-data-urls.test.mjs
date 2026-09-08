import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePageUrl, toAbsolute } from '../../js/ui/structured-data.js';
import {
  getProductImage,
  getProductLink,
  initNewArrivalsProducts,
  initSaleProducts,
} from '../../js/features/products.js';
import { initFilters } from '../../js/features/filters.js';

const ORIGIN = 'https://e-commerce-pr01-voltgarage.netlify.app';
const SHOP = `${ORIGIN}/pages/shop.html`;
const CATALOG_IMAGE = 'assets/images/products/emblemat-01.jpg';

// The runtime modules read the document base URL and the location fields the browser
// exposes; nothing else of the DOM is involved in producing a structured-data URL.
function mount(pageUrl, canonicalHref) {
  const url = new URL(pageUrl);
  globalThis.window = {
    location: { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search },
  };
  globalThis.document = {
    baseURI: url.href,
    querySelector: (selector) =>
      selector === 'link[rel="canonical"]' && canonicalHref
        ? { getAttribute: () => canonicalHref }
        : null,
  };
  return url.href;
}

test('a listing page resolves its product links to the route the page navigates to', () => {
  for (const origin of [ORIGIN, 'http://localhost:4173']) {
    for (const page of ['shop.html', 'new-arrivals.html', 'promotions.html']) {
      const pageUrl = mount(`${origin}/pages/${page}`);
      const link = getProductLink('emblem-carbon');
      assert.equal(link, 'product.html?id=emblem-carbon');
      assert.equal(toAbsolute(link), `${origin}/pages/product.html?id=emblem-carbon`);
      assert.equal(toAbsolute(link), new URL(link, pageUrl).href);
    }
  }
});

test('the home document resolves the product link it renders for the same product', () => {
  const pageUrl = mount(`${ORIGIN}/index.html`);
  const link = getProductLink('emblem-carbon');
  assert.equal(link, 'pages/product.html?id=emblem-carbon');
  assert.equal(toAbsolute(link), `${ORIGIN}/pages/product.html?id=emblem-carbon`);
  assert.equal(toAbsolute(link), new URL(link, pageUrl).href);
});

test('a "../" reference from /pages/ still resolves to the site root', () => {
  const pageUrl = mount(SHOP);
  assert.equal(getProductImage(CATALOG_IMAGE), `../${CATALOG_IMAGE}`);
  assert.equal(toAbsolute(getProductImage(CATALOG_IMAGE)), `${ORIGIN}/${CATALOG_IMAGE}`);
  assert.equal(toAbsolute('../index.html'), `${ORIGIN}/index.html`);
  assert.equal(toAbsolute('../index.html'), new URL('../index.html', pageUrl).href);
});

test('root-relative, absolute, and fragment-bearing references keep their meaning', () => {
  mount(`${SHOP}?category=akcesoria#lista`);
  assert.equal(toAbsolute('/data/products.json'), `${ORIGIN}/data/products.json`);
  assert.equal(toAbsolute(`${ORIGIN}/pages/cart.html`), `${ORIGIN}/pages/cart.html`);
  assert.equal(
    toAbsolute('https://cdn.example.invalid/a.png'),
    'https://cdn.example.invalid/a.png'
  );
  assert.equal(toAbsolute('product.html?id=x#tab'), `${ORIGIN}/pages/product.html?id=x#tab`);
});

test('page URL resolution still prefers the canonical link and drops the fragment', () => {
  mount(`${ORIGIN}/pages/product.html?id=emblem-carbon#opis`, `${ORIGIN}/pages/product.html`);
  assert.equal(resolvePageUrl(), `${ORIGIN}/pages/product.html`);
  assert.equal(
    resolvePageUrl({ preferCanonical: false }),
    `${ORIGIN}/pages/product.html?id=emblem-carbon`
  );
  mount(`${SHOP}#lista`);
  assert.equal(resolvePageUrl(), SHOP);
});

test('listing initializers write absolute product URLs into the final ItemList payload', async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });
  const products = ['emblem-carbon', 'interior-mat'].map((id) => ({
    id,
    name: `Product ${id}`,
    image: CATALOG_IMAGE,
    price: 100,
    category: 'Akcesoria',
    description: 'Test product',
    badge: 'Nowość',
    onSale: true,
  }));
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => products }));

  for (const [page, kind, initialize] of [
    ['shop.html', 'shop', initFilters],
    ['new-arrivals.html', 'new', initNewArrivalsProducts],
    ['promotions.html', 'sale', initSaleProducts],
  ]) {
    const pageUrl = mount(`${ORIGIN}/pages/${page}`);
    const scripts = [];
    const container = { innerHTML: '', setAttribute() {}, classList: { toggle() {} } };
    // Only provide the grid and script sink used by the real listing initializers.
    document.querySelector = (selector) =>
      selector === `[data-products="${kind}"]` ? container : null;
    document.querySelectorAll = () => [];
    document.head = {
      querySelector: () => null,
      appendChild: (script) => scripts.push(script),
    };
    document.createElement = (tag) => {
      assert.equal(tag, 'script');
      return { dataset: {}, textContent: '' };
    };

    await initialize();

    assert.equal(scripts.length, 1, page);
    const [script] = scripts;
    assert.equal(script.type, 'application/ld+json');
    assert.equal(script.dataset.jsonldKey, 'itemlist');
    const payload = JSON.parse(script.textContent);
    assert.equal(payload['@type'], 'ItemList');
    assert.equal(payload.itemListElement.length, products.length);
    for (const [index, item] of payload.itemListElement.entries()) {
      const product = products[index];
      const link = getProductLink(product.id);
      assert.equal(item['@type'], 'ListItem');
      assert.equal(item.url, `${ORIGIN}/pages/product.html?id=${product.id}`, page);
      assert.equal(new URL(item.url).protocol, 'https:');
      assert.equal(item.url, new URL(link, pageUrl).href);
      assert.ok(container.innerHTML.includes(`href="${link}"`));
    }
  }
});
