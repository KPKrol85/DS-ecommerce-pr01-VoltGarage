import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';
import { initCartPage } from '../../js/features/cart.js';
import { initProductDetails } from '../../js/features/products.js';
import { safeStorage } from '../../js/services/storage.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CATALOG = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/products.json'), 'utf8'));
const ORIGIN = 'https://e-commerce-pr01-voltgarage.netlify.app';
const PRODUCT_PATH = '/pages/product.html';

const CART_KEY = 'volt_cart';
const CART_EMPTY_MESSAGE = 'Koszyk jest pusty. Dodaj produkty ze sklepu.';
const CART_ERROR_MESSAGE = 'Nie udało się wczytać produktów koszyka.';
const NOT_FOUND_MESSAGE = 'Nie znaleziono produktu o podanym identyfikatorze.';
const CHECKOUT_CTA = 'Przejdź do zamówienia';
const ABSENT_ID = 'emblem-carbon-2019';
const LOAD_LABEL = '[VOLT][cart:load-products]';
const SHIPPING_FEE = 20;

// Two catalog entries carry this whole file: one priced so a small quantity stays under the free
// shipping threshold and crosses it on the next increment, and one that is not the first entry.
const PAID_SHIPPING = CATALOG.find((product) => product.id === 'emblem-carbon');
const REQUESTED_ENTRY = CATALOG.find((product) => product.id === 'gadget-cam');
const [FIRST_ENTRY] = CATALOG;
assert.ok(PAID_SHIPPING && REQUESTED_ENTRY, 'a fixture product left the catalog');
assert.notEqual(REQUESTED_ENTRY.id, FIRST_ENTRY.id, 'the fixture stopped proving anything');
assert.ok(
  !CATALOG.some((product) => product.id === ABSENT_ID),
  'the fixture id for an absent product is now a real catalog entry'
);

const readDocument = async (file) =>
  renderHtml(ROOT, file, await fs.readFile(path.join(ROOT, file), 'utf8'));

const CART_DOCUMENT = await readDocument('pages/cart.html');
const PRODUCT_DOCUMENT = await readDocument('pages/product.html');

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const textOf = (markup) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Read a region as a subtree: walk from its start tag to the matching end tag so a nested element
// of the same name cannot end the slice early.
function regionOf(markup, hook, label) {
  const opening = new RegExp(`<(\\w+)\\b[^>]*\\s${escapeForRegExp(hook)}(?=[\\s>])[^>]*>`);
  const match = markup.match(opening);
  assert.ok(match, `${label}: no element carries ${hook}`);
  const name = match[1];
  const start = match.index + match[0].length;
  const boundaries = new RegExp(`</?${name}\\b[^>]*>`, 'g');
  boundaries.lastIndex = start;
  let depth = 1;
  let boundary = boundaries.exec(markup);
  while (boundary) {
    depth += boundary[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      return {
        openTag: match[0],
        inner: markup.slice(start, boundary.index),
        outer: markup.slice(match.index, boundaries.lastIndex),
      };
    }
    boundary = boundaries.exec(markup);
  }
  return assert.fail(`${label}: the ${hook} region is never closed`);
}

const isHidden = (openTag) => /\shidden(?=[\s>])/.test(openTag);

function fallbackOf(markup, hook, label) {
  const { inner } = regionOf(markup, hook, label);
  const paragraph = inner.match(/<p\b[^>]*\bproducts-fallback\b[^>]*>[\s\S]*?<\/p>/);
  assert.ok(paragraph, `${label}: ${hook} ships no static fallback paragraph`);
  return paragraph[0];
}

// A: the static contract ------------------------------------------------------------------------

// The five regions that already shipped a fallback are listed beside the two this change adds, so
// the baseline reads as one contract rather than a habit the next dynamic region can skip.
const DYNAMIC_REGIONS = [
  ['index.html', 'data-products="featured"'],
  ['pages/shop.html', 'data-products="shop"'],
  ['pages/new-arrivals.html', 'data-products="new"'],
  ['pages/promotions.html', 'data-products="sale"'],
  ['pages/product.html', 'data-products="related"'],
  ['pages/product.html', 'data-product-details'],
  ['pages/cart.html', 'data-cart-items'],
];

for (const [file, hook] of DYNAMIC_REGIONS) {
  test(`${file} ships a visible JavaScript-required fallback inside ${hook}`, async () => {
    const markup = await readDocument(file);
    const label = `${file} (${hook})`;
    const region = regionOf(markup, hook, label);

    assert.ok(!isHidden(region.openTag), `${label}: the region itself ships hidden`);
    assert.ok(!region.inner.includes('<noscript'), `${label}: the fallback is noscript-gated`);

    const fallback = fallbackOf(markup, hook, label);
    assert.ok(!isHidden(fallback), `${label}: the fallback ships hidden`);
    assert.match(fallback, /class="[^"]*\bstate-block\b[^"]*"/, `${label}: state block not reused`);
    assert.match(fallback, /class="[^"]*\bstate-block--empty\b[^"]*"/, `${label}: wrong variant`);

    const text = textOf(fallback);
    assert.match(text, /JavaScript/, `${label}: the fallback never mentions JavaScript`);
    assert.match(text, /dynamicznie/, `${label}: the fallback never says the region is dynamic`);
  });
}

test('the cart fallback names the cart rather than a generic product list', () => {
  const text = textOf(fallbackOf(CART_DOCUMENT, 'data-cart-items', 'pages/cart.html'));
  assert.match(text, /koszyk/i);
});

test('the product-detail fallback names the details it stands in for', () => {
  const text = textOf(fallbackOf(PRODUCT_DOCUMENT, 'data-product-details', 'pages/product.html'));
  assert.match(text, /szczegóły produktu/i);
});

test('the static cart keeps every zero total and the checkout CTA inside a hidden summary', () => {
  const summary = regionOf(CART_DOCUMENT, 'data-cart-summary', 'pages/cart.html');
  assert.ok(isHidden(summary.openTag), 'the cart summary does not ship hidden');

  // Whatever the unscripted document does show, it may not be these figures or this call to
  // action, so they are required to sit inside the region the attribute removes.
  const elsewhere = CART_DOCUMENT.replace(summary.outer, '');
  assert.ok(CART_DOCUMENT.includes('0 zł'), 'the fixture no longer proves anything about totals');
  assert.ok(!elsewhere.includes('0 zł'), 'a zero total is presented outside the hidden summary');
  assert.ok(!elsewhere.includes(CHECKOUT_CTA), 'the checkout CTA sits outside the hidden summary');
  for (const hook of ['data-cart-subtotal', 'data-cart-shipping', 'data-cart-total']) {
    assert.ok(summary.inner.includes(hook), `the summary lost ${hook}`);
    assert.ok(!elsewhere.includes(hook), `${hook} is presented outside the hidden summary`);
  }
});

// The panel declares its own display, which outranks the user-agent rule behind the attribute.
// Without a rule that beats it, `hidden` would leave the summary on screen.
test('the stylesheet keeps the hidden attribute effective on the total panel', async () => {
  const css = (await fs.readFile(path.join(ROOT, 'css/partials/components.css'), 'utf8')).replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()),
    declarations: new Map(
      match[2]
        .split(';')
        .map((piece) => piece.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((piece) => [
          piece.slice(0, piece.indexOf(':')).trim(),
          piece.slice(piece.indexOf(':') + 1).trim(),
        ])
    ),
  }));

  const panel = rules.find((rule) => rule.selectors.includes('.total-panel'));
  assert.ok(panel?.declarations.has('display'), '.total-panel no longer sets its own display');

  const hiddenRule = rules.find((rule) => rule.selectors.includes('.total-panel[hidden]'));
  assert.ok(hiddenRule, 'nothing makes the hidden attribute win over the panel display');
  assert.equal(hiddenRule.declarations.get('display'), 'none !important');
});

// The runtime harness -----------------------------------------------------------------------

function attributeNode(initial) {
  const values = { ...initial };
  return {
    getAttribute: (name) => values[name] ?? null,
    setAttribute: (name, value) => {
      values[name] = value;
    },
  };
}

function mountCartPage(t, { stored = null } = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  });

  let cart = stored;
  t.mock.method(safeStorage, 'get', (key) => {
    assert.equal(key, CART_KEY, 'the cart module owns the storage key');
    return cart;
  });
  t.mock.method(safeStorage, 'set', (key, value) => {
    assert.equal(key, CART_KEY, 'the cart module owns the storage key');
    cart = value;
  });

  let clickHandler = null;
  const container = {
    innerHTML: fallbackOf(CART_DOCUMENT, 'data-cart-items', 'pages/cart.html'),
    setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener: (type, handler) => {
      if (type === 'click') clickHandler = handler;
    },
  };

  const figures = {
    '[data-cart-subtotal]': { textContent: '0 zł' },
    '[data-cart-shipping]': { textContent: '0 zł' },
    '[data-cart-total]': { textContent: '0 zł' },
  };
  const totals = () => ({
    subtotal: figures['[data-cart-subtotal]'].textContent,
    shipping: figures['[data-cart-shipping]'].textContent,
    total: figures['[data-cart-total]'].textContent,
  });

  // Each transition of the attribute is recorded together with what the panel would have shown at
  // that instant, so "revealed after the totals were calculated" is an observable ordering rather
  // than an end state a reversed implementation would satisfy just as well.
  const reveals = [];
  let hidden = true;
  const summary = {
    querySelector: (selector) => figures[selector] ?? null,
    get hidden() {
      return hidden;
    },
    set hidden(next) {
      hidden = next;
      if (!next) reveals.push({ ...totals(), items: container.innerHTML });
    },
  };

  globalThis.document = {
    querySelector: (selector) => {
      if (selector === '[data-cart-items]') return container;
      if (selector === '[data-cart-summary]') return summary;
      return null;
    },
    // No [data-reveal] node is mounted, so the reveal lifecycle stays outside this harness.
    querySelectorAll: () => [],
    documentElement: { classList: { add() {}, remove() {} } },
  };
  globalThis.window = Object.assign(new EventTarget(), {
    innerHeight: 800,
    // Cart rows resolve their image paths against the directory the document is served from.
    location: { pathname: '/pages/cart.html' },
    matchMedia: () => ({ matches: false }),
  });

  return {
    reveals,
    totals,
    get items() {
      return container.innerHTML;
    },
    get hidden() {
      return summary.hidden;
    },
    get stored() {
      return cart === null ? null : JSON.parse(cart);
    },
    activate: (selector, id) =>
      clickHandler({
        target: {
          closest: (query) => (query === selector ? { getAttribute: () => id } : null),
        },
      }),
  };
}

const serveCatalog = () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => CATALOG });
};

const priceOf = (product, qty) => `${(product.price * qty).toFixed(0)} zł`;

// D: the load failure runs first on purpose. fetchProducts caches the first successful catalog for
// the life of its module and a failed load caches nothing, so this is the only point in the file
// where the cart can be observed with no catalog behind it.
test('a cart whose catalog never loads keeps its summary hidden behind the error state', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (label) => logs.push(String(label)));
  const page = mountCartPage(t, { stored: JSON.stringify([{ id: PAID_SHIPPING.id, qty: 2 }]) });
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('offline');
  };

  await initCartPage();

  assert.equal(requests, 1, 'the catalog was served from cache, so nothing was proven');
  assert.ok(
    logs.some((entry) => entry.startsWith(LOAD_LABEL)),
    'the failure was not reported'
  );
  assert.ok(page.items.includes(CART_ERROR_MESSAGE), 'no error state was rendered');
  assert.ok(page.items.includes('state-block--error'), 'the project error block was not reused');
  assert.ok(!page.items.includes('products-fallback'), 'the static fallback survived the failure');
  assert.equal(page.hidden, true, 'the summary was revealed with no catalog behind its totals');
  assert.deepEqual(page.reveals, [], 'the summary was revealed at some point during the failure');
  assert.deepEqual(page.totals(), { subtotal: '0 zł', shipping: '0 zł', total: '0 zł' });
});

// B: an empty cart is a real result, not a degraded one.
test('an empty cart replaces the fallback and reveals verified zero totals', async (t) => {
  serveCatalog();
  const page = mountCartPage(t, { stored: JSON.stringify([]) });

  await initCartPage();

  assert.ok(!page.items.includes('products-fallback'), 'the static fallback was left in place');
  assert.ok(page.items.includes(CART_EMPTY_MESSAGE), 'the empty-cart state was not rendered');
  assert.ok(page.items.includes('state-block--empty'), 'the project empty block was not reused');
  assert.equal(page.hidden, false, 'a verified empty cart never revealed its summary');
  assert.deepEqual(page.totals(), { subtotal: '0 zł', shipping: '0 zł', total: '0 zł' });
  assert.equal(page.reveals.length, 1, 'the summary was revealed more than once');
  assert.ok(
    page.reveals[0].items.includes(CART_EMPTY_MESSAGE),
    'the summary was revealed before the cart region had been rendered'
  );
});

// C: a populated cart calculates, reveals, and then keeps updating in place.
test('a populated cart reveals a summary that already holds its calculated totals', async (t) => {
  serveCatalog();
  const page = mountCartPage(t, { stored: JSON.stringify([{ id: PAID_SHIPPING.id, qty: 2 }]) });

  await initCartPage();

  assert.ok(!page.items.includes('products-fallback'), 'the static fallback was left in place');
  assert.ok(page.items.includes(PAID_SHIPPING.name), 'the cart item was not rendered');
  assert.ok(page.items.includes('data-remove-item'), 'the cart item lost its controls');
  assert.equal(page.hidden, false, 'the summary stayed hidden for a cart that has items');

  // Two of this entry stay under the free-shipping threshold, so the panel prints the fee this
  // project already charges; three cross it and the fee this project already waives.
  const paid = {
    subtotal: priceOf(PAID_SHIPPING, 2),
    shipping: `${SHIPPING_FEE} zł`,
    total: `${(PAID_SHIPPING.price * 2 + SHIPPING_FEE).toFixed(0)} zł`,
  };
  assert.deepEqual(page.totals(), paid);
  assert.equal(page.reveals.length, 1, 'the summary was revealed more than once');
  const { items, ...atReveal } = page.reveals[0];
  assert.deepEqual(atReveal, paid, 'the summary was revealed before its totals had been written');
  assert.ok(items.includes(PAID_SHIPPING.name), 'the summary was revealed before the cart region');

  page.activate('[data-qty-action="inc"]', PAID_SHIPPING.id);

  assert.deepEqual(page.stored, [{ id: PAID_SHIPPING.id, qty: 3 }]);
  assert.deepEqual(page.totals(), {
    subtotal: priceOf(PAID_SHIPPING, 3),
    shipping: '0 zł',
    total: priceOf(PAID_SHIPPING, 3),
  });
  assert.equal(page.hidden, false, 'an update hid the already-revealed summary again');

  page.activate('[data-remove-item]', PAID_SHIPPING.id);

  assert.deepEqual(page.stored, []);
  assert.ok(page.items.includes(CART_EMPTY_MESSAGE), 'emptying the cart lost its empty state');
  assert.deepEqual(page.totals(), { subtotal: '0 zł', shipping: '0 zł', total: '0 zł' });
  assert.equal(page.hidden, false, 'emptying the cart hid the summary');
});

// E and F: the product-detail region ----------------------------------------------------------

function mountProductPage(t, { search = '' } = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });

  const url = new URL(`${ORIGIN}${PRODUCT_PATH}${search}`);
  const staticCanonical = PRODUCT_DOCUMENT.replace(/\s+/g, ' ').match(
    /<link rel="canonical" href="([^"]+)"/
  );
  assert.ok(staticCanonical, 'pages/product.html no longer declares a canonical link');
  const container = {
    innerHTML: fallbackOf(PRODUCT_DOCUMENT, 'data-product-details', 'pages/product.html'),
    setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} },
  };
  const canonical = attributeNode({ href: staticCanonical[1] });
  const scripts = [];
  globalThis.document = {
    baseURI: url.href,
    title: 'Produkt | VOLT GARAGE',
    head: {
      querySelector: (selector) => {
        const key = selector.match(/data-jsonld-key="([^"]+)"/)?.[1];
        return scripts.find((script) => script.dataset.jsonldKey === key) ?? null;
      },
      appendChild: (script) => scripts.push(script),
    },
    documentElement: { classList: { add() {}, remove() {} } },
    createElement: (tag) => ({ tagName: tag, dataset: {}, textContent: '' }),
    querySelector: (selector) => {
      if (selector === '[data-product-details]') return container;
      if (selector === 'link[rel="canonical"]') return canonical;
      return null;
    },
    querySelectorAll: () => [],
  };
  globalThis.window = {
    innerHeight: 800,
    location: { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search },
    matchMedia: () => ({ matches: false }),
  };

  return {
    staticCanonical: staticCanonical[1],
    get markup() {
      return container.innerHTML;
    },
    get canonical() {
      return canonical.getAttribute('href');
    },
    get jsonLdText() {
      return scripts.map((entry) => entry.textContent).join('\n');
    },
  };
}

test('a real product replaces the static fallback with its own detail view', async (t) => {
  serveCatalog();
  const page = mountProductPage(t, { search: `?id=${REQUESTED_ENTRY.id}` });

  await initProductDetails();

  assert.ok(!page.markup.includes('products-fallback'), 'the static fallback was left in place');
  assert.ok(page.markup.includes(REQUESTED_ENTRY.name), 'the requested product was not rendered');
  assert.ok(page.markup.includes('data-qty-select'), 'the product lost its quantity control');
  assert.ok(
    page.markup.includes(`data-product-id="${REQUESTED_ENTRY.id}"`),
    'the product is not addressable from add-to-cart'
  );
  assert.equal(page.canonical, `${ORIGIN}${PRODUCT_PATH}?id=${REQUESTED_ENTRY.id}`);
  assert.ok(page.jsonLdText.includes(REQUESTED_ENTRY.id), 'the product lost its structured data');
});

test('an unknown id still replaces the fallback with the not-found state alone', async (t) => {
  serveCatalog();
  const page = mountProductPage(t, { search: `?id=${ABSENT_ID}` });

  await initProductDetails();

  assert.ok(!page.markup.includes('products-fallback'), 'the static fallback was left in place');
  assert.ok(page.markup.includes(NOT_FOUND_MESSAGE), 'the not-found state was not rendered');
  assert.ok(!page.markup.includes('data-add-to-cart'), 'an unrelated product stayed buyable');
  for (const product of CATALOG) {
    assert.ok(!page.markup.includes(product.name), `${product.id} was substituted`);
    assert.ok(!page.jsonLdText.includes(product.id), `${product.id} reached structured data`);
  }
  assert.equal(page.canonical, page.staticCanonical, 'the canonical link was rewritten');
});
