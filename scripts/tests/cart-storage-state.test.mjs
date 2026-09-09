import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToCart, hasCartItems, initCart } from '../../js/features/cart.js';
import { safeStorage } from '../../js/services/storage.js';

const CART_KEY = 'volt_cart';
const PRODUCT_ID = 'emblem-carbon';
const OTHER_ID = 'emblem-steel';
const ADDED_ID = 'sticker-track';
const PARSE_LABEL = '[VOLT][cart:parse]';

// Every cart operation reaches for an Array method on what the parser returns — reduce for the
// badge, find and push for additions, find, filter and findIndex for the cart page. These values
// all survive JSON.parse, so only a shape check at the deserialization boundary keeps them out.
const NON_ARRAY_JSON = [
  ['an empty object', '{}'],
  ['a populated object', `{"${PRODUCT_ID}":1}`],
  ['a string', '"hello"'],
  ['a number', '123'],
  ['a boolean', 'true'],
  ['null', 'null'],
];

const INVALID_ARRAY_JSON = [
  ['a null member', '[null]'],
  ['a string member', '["x"]'],
  ['an empty object member', '[{}]'],
  ['an array member', '[[]]'],
  ['a numeric member', '[1]'],
  ['a boolean member', '[true]'],
  ['a missing id', '[{"qty":1}]'],
  ['a missing quantity', '[{"id":"x"}]'],
  ['a numeric id', '[{"id":1,"qty":1}]'],
  ['an empty id', '[{"id":"","qty":1}]'],
  ['a blank id', '[{"id":"   ","qty":1}]'],
  ['a string quantity', '[{"id":"x","qty":"2"}]'],
  ['a null quantity', '[{"id":"x","qty":null}]'],
  ['a boolean quantity', '[{"id":"x","qty":true}]'],
  ['a zero quantity', '[{"id":"x","qty":0}]'],
  ['a negative quantity', '[{"id":"x","qty":-1}]'],
  ['a fractional quantity', '[{"id":"x","qty":1.5}]'],
  ['an infinite quantity', '[{"id":"x","qty":1e400}]'],
];

const VALID_ARRAY_JSON = [
  ['an empty cart', '[]', 0],
  ['a single item', JSON.stringify([{ id: PRODUCT_ID, qty: 1 }]), 1],
  [
    'several items',
    JSON.stringify([
      { id: PRODUCT_ID, qty: 2 },
      { id: OTHER_ID, qty: 3 },
    ]),
    5,
  ],
];

// The runtime is exercised through the module's public entry points against storage doubles;
// getCart itself stays private, so the contract is observed where the storefront observes it.
function mountCart(t, initial = null) {
  const parseErrors = [];
  let stored = initial;
  t.mock.method(console, 'error', (label) => {
    if (String(label).startsWith(PARSE_LABEL)) parseErrors.push(String(label));
  });
  t.mock.method(safeStorage, 'get', (key) => {
    assert.equal(key, CART_KEY, 'the cart module owns the storage key');
    return stored;
  });
  t.mock.method(safeStorage, 'set', (key, value) => {
    assert.equal(key, CART_KEY, 'the cart module owns the storage key');
    stored = value;
  });
  t.mock.method(safeStorage, 'remove', () =>
    assert.fail('malformed state must not be cleared as a side effect')
  );
  const counters = [{ textContent: '' }];
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-cart-count]' ? counters : []),
  };
  globalThis.window = new EventTarget();
  return {
    get raw() {
      return stored;
    },
    get cart() {
      return stored === null ? null : JSON.parse(stored);
    },
    get count() {
      return counters[0].textContent;
    },
    get parseErrors() {
      return parseErrors;
    },
  };
}

for (const [label, raw] of [...NON_ARRAY_JSON, ...INVALID_ARRAY_JSON]) {
  test(`the cart badge survives storage holding ${label}`, (t) => {
    const page = mountCart(t, raw);
    assert.doesNotThrow(() => initCart(), `${label} reached an array-only cart operation`);
    assert.equal(page.count, '0', `${label} must be counted as an empty cart`);
    assert.equal(page.raw, raw, 'reading the cart must not rewrite storage');
    assert.equal(safeStorage.set.mock.callCount(), 0);
  });

  test(`checkout reads storage holding ${label} as an empty cart`, (t) => {
    mountCart(t, raw);
    assert.equal(hasCartItems(), false, `${label} must not be reported as cart contents`);
    assert.equal(safeStorage.set.mock.callCount(), 0);
  });

  test(`addToCart recovers storage holding ${label} into a valid cart array`, (t) => {
    const page = mountCart(t, raw);
    initCart();
    assert.doesNotThrow(() => addToCart(PRODUCT_ID), `${label} broke the add-to-cart path`);
    assert.deepEqual(page.cart, [{ id: PRODUCT_ID, qty: 1 }]);
    assert.equal(page.count, '1', 'the badge must follow the recovered cart');
    assert.equal(hasCartItems(), true);
  });

  test(`storage holding ${label} is not reported as a parse failure`, (t) => {
    const page = mountCart(t, raw);
    initCart();
    addToCart(PRODUCT_ID);
    assert.deepEqual(page.parseErrors, [], `${label} parses cleanly and must not be logged`);
  });
}

for (const [label, raw, count] of VALID_ARRAY_JSON) {
  test(`valid array state is preserved for ${label}`, (t) => {
    const page = mountCart(t, raw);
    initCart();
    assert.equal(page.count, String(count));
    assert.equal(hasCartItems(), count > 0);
    assert.equal(page.raw, raw, 'a well-formed cart must be left untouched');
  });

  test(`adding to ${label} keeps every existing entry`, (t) => {
    const page = mountCart(t, raw);
    initCart();
    addToCart(ADDED_ID);
    assert.deepEqual(page.cart, [...JSON.parse(raw), { id: ADDED_ID, qty: 1 }]);
    assert.equal(page.count, String(count + 1));
  });
}

test('mixed arrays retain valid records without rewriting storage until an addition', (t) => {
  const valid = [
    { id: PRODUCT_ID, qty: 2 },
    { id: OTHER_ID, qty: 3 },
  ];
  const raw = JSON.stringify([null, valid[0], 'bad', {}, { id: 'x', qty: '2' }, valid[1]]);
  const page = mountCart(t, raw);
  assert.doesNotThrow(() => initCart());
  assert.equal(page.count, '5');
  assert.equal(hasCartItems(), true);
  assert.equal(page.raw, raw);
  assert.equal(safeStorage.set.mock.callCount(), 0);
  assert.deepEqual(page.parseErrors, []);

  addToCart(PRODUCT_ID);
  assert.deepEqual(page.cart, [{ id: PRODUCT_ID, qty: 3 }, valid[1]]);
  assert.equal(page.count, '6');
  addToCart(ADDED_ID);
  assert.deepEqual(page.cart, [{ id: PRODUCT_ID, qty: 3 }, valid[1], { id: ADDED_ID, qty: 1 }]);
  assert.equal(page.count, '7');
  assert.deepEqual(page.parseErrors, []);
});

test('missing storage still renders an empty badge without a parse failure', (t) => {
  const page = mountCart(t);
  initCart();
  assert.equal(page.count, '0');
  assert.equal(hasCartItems(), false);
  assert.deepEqual(page.parseErrors, []);
  assert.equal(page.raw, null, 'an absent cart must not be written back');
});

test('invalid JSON keeps recovering to an empty cart and keeps logging the failure', (t) => {
  const page = mountCart(t, '{invalid JSON');
  initCart();
  assert.equal(page.count, '0');
  assert.equal(hasCartItems(), false);
  assert.ok(page.parseErrors.length > 0, 'a parse failure must still be logged');
  assert.equal(page.raw, '{invalid JSON', 'a failed parse must not clear storage');

  addToCart(PRODUCT_ID);
  assert.deepEqual(page.cart, [{ id: PRODUCT_ID, qty: 1 }]);
  assert.equal(page.count, '1');
});
