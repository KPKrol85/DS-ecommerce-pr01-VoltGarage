import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initAddToCartButtons, initCart } from '../../js/features/cart.js';
import { initProductDetails, renderGrid } from '../../js/features/products.js';
import { safeStorage } from '../../js/services/storage.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://volt-garage.invalid';
// The confirmation is temporary feedback, so it lasts 1200 ms from the most recent activation.
// A click inside that window extends it; it never ends it, and never becomes the resting label.
const FEEDBACK_MS = 1200;
const RESTING_LABEL = 'Dodaj';
const FEEDBACK_LABEL = 'Dodano';
const ADD_BUTTON = /<button\b[^>]*\bdata-add-to-cart\b[^>]*>([\s\S]*?)<\/button>/g;

const products = JSON.parse(
  await fs.readFile(path.join(ROOT, 'public/data/products.json'), 'utf8')
);

const renderTarget = () => ({
  setAttribute() {},
  classList: { add() {}, remove() {}, toggle() {} },
  innerHTML: '',
});

const attributeStore = () => {
  const attributes = new Map();
  return {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
  };
};

// The product module renders the buttons, so the markup under test is what the storefront
// ships rather than a fixture that can drift away from it.
function renderCardMarkup() {
  const container = renderTarget();
  globalThis.window = { location: { pathname: '/pages/shop.html' } };
  globalThis.document = { querySelectorAll: () => [] };
  renderGrid(container, products.slice(0, 2));
  return container.innerHTML;
}

async function renderDetailMarkup(id) {
  const container = renderTarget();
  const canonical = attributeStore();
  const meta = attributeStore();
  globalThis.window = {
    location: {
      pathname: '/pages/product.html',
      search: `?id=${id}`,
      origin: ORIGIN,
      href: `${ORIGIN}/pages/product.html?id=${id}`,
    },
  };
  globalThis.document = {
    baseURI: `${ORIGIN}/pages/product.html`,
    head: { querySelector: () => null, appendChild() {} },
    createElement: () => ({ dataset: {} }),
    querySelector: (selector) => {
      if (selector === '[data-product-details]') return container;
      if (selector.startsWith('link')) return canonical;
      if (selector.startsWith('meta')) return meta;
      return null;
    },
    querySelectorAll: () => [],
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => products });
  await initProductDetails();
  return container.innerHTML;
}

function addButtonsIn(markup, context) {
  const found = [...markup.matchAll(ADD_BUTTON)];
  assert.ok(found.length, `${context}: the rendered markup ships no add-to-cart button`);
  return found.map(([tag, label]) => ({
    context,
    tag,
    label: label.trim(),
    id: tag.match(/\bdata-product-id="([^"]+)"/)?.[1] ?? null,
  }));
}

const RENDERED = [
  { context: 'product card', buttons: addButtonsIn(renderCardMarkup(), 'product card') },
  {
    context: 'product detail',
    buttons: addButtonsIn(await renderDetailMarkup(products[1].id), 'product detail'),
  },
];

// The rendered control carries no aria-label, so its accessible name is its visible text.
function addButton({ label, id }) {
  const button = {
    textContent: label,
    getAttribute: (name) => (name === 'data-product-id' ? id : null),
    get accessibleName() {
      return button.getAttribute('aria-label') ?? button.textContent;
    },
  };
  button.closest = (selector) => (selector === '[data-add-to-cart]' ? button : null);
  return button;
}

// A local fake clock keeps the suite deterministic without the experimental MockTimers API.
// Timeouts fire in due order, and one scheduled from inside a callback is honoured as well.
function fakeClock(t) {
  const pending = new Map();
  let now = 0;
  let sequence = 0;
  t.mock.method(globalThis, 'setTimeout', (fn, delay = 0) => {
    sequence += 1;
    pending.set(sequence, { fn, due: now + Number(delay), order: sequence });
    return sequence;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => {
    pending.delete(id);
  });
  return (ms) => {
    const target = now + ms;
    for (;;) {
      const [next] = [...pending]
        .filter(([, timer]) => timer.due <= target)
        .sort(([, a], [, b]) => a.due - b.due || a.order - b.order);
      if (!next) break;
      const [id, timer] = next;
      pending.delete(id);
      // The clock reaches a timeout before it runs, so whatever it schedules starts from there.
      now = timer.due;
      timer.fn();
    }
    now = target;
  };
}

// The runtime is exercised through the delegated listener it actually registers, against the
// real cart module, with only storage and the clock replaced.
function mountStore(t, specs, { qty = null } = {}) {
  const advance = fakeClock(t);
  let stored = null;
  let updates = 0;
  t.mock.method(safeStorage, 'get', () => stored);
  t.mock.method(safeStorage, 'set', (key, value) => {
    assert.equal(key, 'volt_cart', 'the cart module owns the storage key');
    stored = value;
  });
  const counters = [{ textContent: '' }];
  const qtySelect = qty === null ? null : { value: String(qty) };
  let click = null;
  globalThis.document = {
    addEventListener: (type, handler) => {
      if (type === 'click') click = handler;
    },
    querySelector: (selector) => (selector === '[data-qty-select]' ? qtySelect : null),
    querySelectorAll: (selector) => (selector === '[data-cart-count]' ? counters : []),
  };
  globalThis.window = new EventTarget();
  globalThis.window.addEventListener('cart:updated', () => (updates += 1));
  initCart();
  initAddToCartButtons();
  return {
    buttons: specs.map(addButton),
    click: (button) => click({ target: button }),
    advance,
    get cart() {
      return stored === null ? [] : JSON.parse(stored);
    },
    get count() {
      return counters[0].textContent;
    },
    get updates() {
      return updates;
    },
  };
}

test('every rendered add-to-cart button is named by the label the runtime restores', () => {
  const buttons = RENDERED.flatMap((entry) => entry.buttons);
  assert.equal(buttons.length, 3, 'both product contexts should contribute buttons');
  for (const { context, tag, label, id } of buttons) {
    assert.equal(label, RESTING_LABEL, `${context}: unexpected resting label`);
    assert.ok(id, `${context}: the button carries no product id`);
    assert.match(tag, /\btype="button"/, `${context}: the control must stay a plain button`);
    // A separate name would decouple the accessible name from the label being restored here.
    assert.ok(
      !/\baria-label(?:ledby)?\s*=/.test(tag),
      `${context}: the accessible name must keep following the visible label`
    );
  }
});

for (const { context, buttons } of RENDERED) {
  test(`${context}: one activation confirms, then restores the label and the name`, (t) => {
    const page = mountStore(t, [buttons[0]]);
    const [button] = page.buttons;
    assert.equal(button.textContent, RESTING_LABEL);
    assert.equal(button.accessibleName, RESTING_LABEL);

    page.click(button);
    assert.equal(button.textContent, FEEDBACK_LABEL);
    assert.equal(button.accessibleName, FEEDBACK_LABEL);

    page.advance(FEEDBACK_MS - 1);
    assert.equal(button.textContent, FEEDBACK_LABEL, 'the confirmation ended early');
    page.advance(1);
    assert.equal(button.textContent, RESTING_LABEL);
    assert.equal(button.accessibleName, RESTING_LABEL);
  });

  test(`${context}: a second activation inside the window never becomes the resting label`, (t) => {
    const page = mountStore(t, [buttons[0]]);
    const [button] = page.buttons;

    page.click(button);
    page.advance(600);
    page.click(button);
    assert.equal(button.textContent, FEEDBACK_LABEL);

    // The first activation's timeout comes due here and must not finalize anything.
    page.advance(FEEDBACK_MS - 600);
    assert.equal(button.textContent, FEEDBACK_LABEL, 'the older timeout cut the newer feedback');
    page.advance(599);
    assert.equal(button.textContent, FEEDBACK_LABEL, 'the window runs from the latest click');

    page.advance(1);
    assert.equal(button.textContent, RESTING_LABEL, 'the confirmation was left on the button');
    assert.equal(button.accessibleName, RESTING_LABEL, 'the accessible name kept the confirmation');
  });
}

test('repeated rapid activation always settles back on the resting label', (t) => {
  const [spec] = RENDERED[0].buttons;
  const page = mountStore(t, [spec]);
  const [button] = page.buttons;

  // Every click lands inside the first window, so overlapping timeouts would each get a turn.
  for (let index = 0; index < 5; index += 1) {
    page.click(button);
    page.advance(100);
  }
  assert.equal(button.textContent, FEEDBACK_LABEL, 'a stale timeout ended the feedback early');

  page.advance(FEEDBACK_MS);
  assert.equal(button.textContent, RESTING_LABEL);
  page.advance(FEEDBACK_MS * 4);
  assert.equal(button.textContent, RESTING_LABEL, 'a stale timeout restored the confirmation');
  assert.equal(button.accessibleName, RESTING_LABEL);
  assert.deepEqual(page.cart, [{ id: spec.id, qty: 5 }], 'every activation must reach the cart');
});

test('two rapid activations still perform two cart additions', (t) => {
  const [spec] = RENDERED[0].buttons;
  const page = mountStore(t, [spec]);
  const [button] = page.buttons;

  page.click(button);
  page.click(button);
  assert.deepEqual(page.cart, [{ id: spec.id, qty: 2 }]);
  assert.equal(page.count, '2', 'the cart count must follow both additions');
  assert.equal(page.updates, 2, 'each activation announces its own cart update');
  assert.equal(button.textContent, FEEDBACK_LABEL);

  page.advance(FEEDBACK_MS);
  assert.equal(button.textContent, RESTING_LABEL);
  assert.deepEqual(page.cart, [{ id: spec.id, qty: 2 }], 'restoring must not touch the cart');
  assert.equal(page.count, '2');
});

test('the quantity selector still applies to every activation', (t) => {
  const [spec] = RENDERED[1].buttons;
  const page = mountStore(t, [spec], { qty: 3 });
  const [button] = page.buttons;

  page.click(button);
  page.advance(600);
  page.click(button);
  assert.deepEqual(page.cart, [{ id: spec.id, qty: 6 }]);
  assert.equal(page.count, '6');

  page.advance(FEEDBACK_MS);
  assert.equal(button.textContent, RESTING_LABEL);
});

test('one button never disturbs another button label or timer', (t) => {
  const specs = RENDERED[0].buttons;
  assert.notEqual(specs[0].id, specs[1].id, 'the grid should render distinct products');
  const page = mountStore(t, specs);
  const [first, second] = page.buttons;

  page.click(first);
  page.advance(600);
  page.click(second);
  assert.equal(first.textContent, FEEDBACK_LABEL);
  assert.equal(second.textContent, FEEDBACK_LABEL);

  page.advance(600);
  assert.equal(first.textContent, RESTING_LABEL, 'the first button missed its own restore');
  assert.equal(second.textContent, FEEDBACK_LABEL, 'the first button ended the second feedback');

  page.advance(600);
  assert.equal(first.textContent, RESTING_LABEL);
  assert.equal(second.textContent, RESTING_LABEL);
  assert.equal(first.accessibleName, RESTING_LABEL);
  assert.equal(second.accessibleName, RESTING_LABEL);
  assert.deepEqual(page.cart, [
    { id: specs[0].id, qty: 1 },
    { id: specs[1].id, qty: 1 },
  ]);
});

test('re-clicking one button leaves a neighbour resting label intact', (t) => {
  const specs = RENDERED[0].buttons;
  const page = mountStore(t, specs);
  const [first, second] = page.buttons;

  page.click(first);
  page.advance(400);
  page.click(first);
  page.advance(400);
  page.click(second);
  assert.equal(second.textContent, FEEDBACK_LABEL);

  page.advance(FEEDBACK_MS);
  assert.equal(first.textContent, RESTING_LABEL);
  assert.equal(second.textContent, RESTING_LABEL);
  assert.deepEqual(page.cart, [
    { id: specs[0].id, qty: 2 },
    { id: specs[1].id, qty: 1 },
  ]);
});

test('a re-rendered button keeps its own label while the replaced one is mid-feedback', (t) => {
  const [spec] = RENDERED[0].buttons;
  // renderGrid replaces the grid, so a later activation lands on a new element for one product.
  const page = mountStore(t, [spec, spec]);
  const [replaced, rendered] = page.buttons;

  page.click(replaced);
  page.advance(600);
  page.click(rendered);
  assert.equal(rendered.textContent, FEEDBACK_LABEL);

  page.advance(600);
  assert.equal(replaced.textContent, RESTING_LABEL);
  assert.equal(rendered.textContent, FEEDBACK_LABEL, 'the replaced button ended the new feedback');

  page.advance(600);
  assert.equal(rendered.textContent, RESTING_LABEL);
  assert.deepEqual(page.cart, [{ id: spec.id, qty: 2 }]);
});
