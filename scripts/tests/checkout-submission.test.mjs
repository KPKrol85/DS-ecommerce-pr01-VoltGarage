import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { hasCartItems } from '../../js/features/cart.js';
import { safeStorage } from '../../js/services/storage.js';

const mainSource = await fs.readFile(new URL('../../js/main.js', import.meta.url), 'utf8');
// Exercise the actual form initializer without running unrelated page bootstrapping.
const initializer = mainSource.match(/const initForms = \(\) => \{[\s\S]*?\n\};/)?.[0];
assert.ok(initializer, 'the form initializer is available');

const EMPTY_MESSAGE =
  'Koszyk jest pusty. Dodaj co najmniej jeden produkt przed kontynuowaniem zamówienia.';
const SUCCESS_MESSAGE =
  'Symulacja checkoutu zakończyła się pomyślnie. Zamówienie nie zostało wysłane ani zapisane.';
const INVALID_MESSAGE = 'Uzupełnij wymagane pola i popraw zaznaczone błędy.';
const populatedCart = JSON.stringify([{ id: 'emblem-carbon', qty: 1 }]);

function cartStorage(t, initial = null) {
  let stored = initial;
  let reads = 0;
  t.mock.method(safeStorage, 'get', (key) => {
    assert.equal(key, 'volt_cart', 'the cart module owns the storage key');
    reads++;
    return stored;
  });
  t.mock.method(safeStorage, 'set', () => assert.fail('submission must not write storage'));
  t.mock.method(safeStorage, 'remove', () => assert.fail('submission must not clear storage'));
  return {
    set: (value) => (stored = value),
    get reads() {
      return reads;
    },
  };
}

function field(name, value, type = 'text', required = true) {
  const attributes = new Map(required ? [['required', '']] : []);
  const error = { id: `${name}-error`, textContent: '', hidden: true };
  return {
    name,
    type,
    value,
    minLength: type === 'tel' ? 7 : -1,
    pattern: type === 'tel' ? String.raw`^[0-9+][0-9\s\-]{6,19}$` : '',
    focused: false,
    error,
    closest: () => ({ querySelector: () => error }),
    hasAttribute: (name) => attributes.has(name),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    focus() {
      this.focused = true;
    },
  };
}

function mountForm({ checkout = true, withStatus = true } = {}) {
  // Small DOM doubles cover validation, focus, status, cancellation, and reset.
  // Real rendered fields and browser submission are verified against Vite output.
  const fields = [
    field('firstName', 'Anna'),
    field('email', 'anna@example.com', 'email'),
    field('phone', '533 537 091', 'tel'),
    field('note', 'Test lokalny', 'textarea', false),
  ];
  const status = { textContent: '', setAttribute() {} };
  const form = new EventTarget();
  let resets = 0;
  let cartChecks = 0;
  Object.assign(form, {
    hasAttribute: (name) => name === 'data-checkout-form' && checkout,
    querySelector: () => (withStatus ? status : null),
    querySelectorAll: () => fields,
    reset: () => {
      resets++;
      fields.forEach((field) => (field.value = ''));
    },
  });
  vm.runInNewContext(`${initializer}\ninitForms();`, {
    document: { querySelectorAll: () => [form] },
    hasCartItems: () => {
      cartChecks++;
      return hasCartItems();
    },
  });
  return {
    fields,
    status,
    submit: () => {
      const event = new Event('submit', { cancelable: true });
      form.dispatchEvent(event);
      return event;
    },
    get resets() {
      return resets;
    },
    get cartChecks() {
      return cartChecks;
    },
  };
}

test('cart presence uses the canonical parser and reads current storage synchronously', (t) => {
  const storage = cartStorage(t);
  t.mock.method(console, 'error', () => {});
  for (const [raw, expected] of [
    [null, false],
    ['[]', false],
    [populatedCart, true],
    ['[]', false],
    ['null', false],
    ['{invalid JSON', false],
  ]) {
    const reads = storage.reads;
    storage.set(raw);
    assert.equal(hasCartItems(), expected);
    assert.equal(storage.reads, reads + 1);
  }
});

test('valid checkout with no stored items reports refusal and retains every value', (t) => {
  const storage = cartStorage(t);
  for (const raw of [null, '[]']) {
    storage.set(raw);
    const form = mountForm();
    const values = form.fields.map((field) => field.value);
    assert.equal(form.submit().defaultPrevented, true);
    assert.equal(form.status.textContent, EMPTY_MESSAGE);
    assert.equal(form.resets, 0);
    assert.deepEqual(
      form.fields.map((field) => field.value),
      values
    );
    assert.ok(form.fields.every((field) => field.getAttribute('aria-invalid') === 'false'));
    assert.equal(form.cartChecks, 1);
  }
});

test('invalid required, email, and phone fields keep validation and focus ahead of the cart guard', (t) => {
  const storage = cartStorage(t);
  for (const raw of ['[]', populatedCart]) {
    storage.set(raw);
    for (const [index, invalid] of [
      [0, ''],
      [1, 'not-an-email'],
      [2, 'abc12345'],
    ]) {
      const form = mountForm();
      form.fields[index].value = invalid;
      assert.equal(form.submit().defaultPrevented, true);
      assert.equal(form.status.textContent, INVALID_MESSAGE);
      assert.equal(form.fields[index].focused, true);
      assert.equal(form.fields[index].getAttribute('aria-invalid'), 'true');
      assert.equal(form.resets, 0);
      assert.equal(form.cartChecks, 0);
    }
  }
  assert.equal(storage.reads, 0);
});

test('valid populated checkout reports only a simulation and resets exactly once', (t) => {
  cartStorage(t, populatedCart);
  const form = mountForm();
  assert.equal(form.submit().defaultPrevented, true);
  assert.equal(form.status.textContent, SUCCESS_MESSAGE);
  assert.equal(form.resets, 1);
  assert.ok(form.fields.every((field) => field.value === ''));
  assert.equal(form.cartChecks, 1);
});

test('checkout follows changes to storage after initialization in both directions', (t) => {
  const storage = cartStorage(t);
  for (const [initial, current, message, resets] of [
    ['[]', populatedCart, SUCCESS_MESSAGE, 1],
    [populatedCart, '[]', EMPTY_MESSAGE, 0],
  ]) {
    storage.set(initial);
    const form = mountForm();
    assert.equal(form.cartChecks, 0, 'cart presence is not cached during initialization');
    storage.set(current);
    assert.equal(form.submit().defaultPrevented, true);
    assert.equal(form.status.textContent, message);
    assert.equal(form.resets, resets);
    assert.equal(form.cartChecks, 1);
  }
});

test('contact keeps native submission when valid and its existing validation when invalid', (t) => {
  const storage = cartStorage(t);
  for (const raw of ['[]', populatedCart]) {
    storage.set(raw);
    const form = mountForm({ checkout: false });
    const values = form.fields.map((field) => field.value);
    assert.equal(form.submit().defaultPrevented, false);
    assert.equal(form.status.textContent, '');
    assert.deepEqual(
      form.fields.map((field) => field.value),
      values
    );
    form.fields[1].value = 'invalid';
    assert.equal(form.submit().defaultPrevented, true);
    assert.equal(form.status.textContent, INVALID_MESSAGE);
    assert.equal(form.fields[1].focused, true);
    assert.equal(form.resets, 0);
    assert.equal(form.cartChecks, 0);
  }
  assert.equal(storage.reads, 0);
});

test('empty-cart refusal still cancels submission without a status element', (t) => {
  cartStorage(t);
  const form = mountForm({ withStatus: false });
  assert.equal(form.submit().defaultPrevented, true);
  assert.equal(form.resets, 0);
});

test('main imports cart presence without duplicating storage interpretation', () => {
  assert.match(
    mainSource,
    /import\s*\{[^}]*\bhasCartItems\b[^}]*\}\s*from '\.\/features\/cart\.js'/
  );
  assert.doesNotMatch(mainSource, /volt_cart|localStorage|safeStorage|JSON\.parse/);
});
