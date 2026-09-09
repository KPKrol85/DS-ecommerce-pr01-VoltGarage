import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';

const mainSource = await fs.readFile(new URL('../../js/main.js', import.meta.url), 'utf8');
// Exercise the actual form initializer without running unrelated page bootstrapping.
const initializer = mainSource.match(/const initForms = \(\) => \{[\s\S]*?\n\};/)?.[0];
assert.ok(initializer, 'the form initializer is available');

const INVALID_MESSAGE = 'Uzupełnij wymagane pola i popraw zaznaczone błędy.';
const EMPTY_CART_MESSAGE =
  'Koszyk jest pusty. Dodaj co najmniej jeden produkt przed kontynuowaniem zamówienia.';
const PHONE_MESSAGE = 'Podaj poprawny numer telefonu, np. 533 537 091 lub +48 533 537 091.';

const filename = 'pages/checkout.html';
const checkoutSource = await fs.readFile(new URL(`../../${filename}`, import.meta.url), 'utf8');
const checkoutHtml = await renderHtml(
  fileURLToPath(new URL('../../', import.meta.url)),
  filename,
  checkoutSource
);
const zipInputs = [...checkoutHtml.matchAll(/<input\b[^>]*\bname="zip"[^>]*>/g)];
assert.equal(zipInputs.length, 1, 'checkout renders exactly one postal-code field');
const zipInput = zipInputs[0][0];
const zip = {
  pattern: zipInput.match(/\bpattern="([^"]+)"/)?.[1],
  title: zipInput.match(/\btitle="([^"]+)"/)?.[1],
  type: zipInput.match(/\btype="([^"]+)"/)?.[1],
};

// The browser compiles `pattern` anchored and with the `v` flag, and reports no mismatch for an
// empty value. Mirror that here so the code under test never recompiles the expression itself.
function makeField({
  name,
  value = '',
  type = 'text',
  pattern = '',
  title = '',
  required = true,
  minLength = -1,
}) {
  const attributes = new Map(required ? [['required', '']] : []);
  const error = { id: '', textContent: '', hidden: true };
  const wrapper = {
    querySelector: (selector) => {
      assert.equal(selector, '[data-field-error]');
      return error;
    },
  };
  return {
    name,
    type,
    value,
    pattern,
    title,
    minLength,
    error,
    focused: false,
    get validity() {
      return {
        patternMismatch:
          Boolean(this.pattern) &&
          this.value !== '' &&
          !new RegExp(`^(?:${this.pattern})$`, 'v').test(this.value),
      };
    },
    // A detached copy carrying the same declared constraint and its own value, as
    // `cloneNode(false)` returns in the DOM.
    cloneNode: () => makeField({ name, type, pattern, title, required, minLength }),
    closest: () => wrapper,
    hasAttribute: (attribute) => attributes.has(attribute),
    getAttribute: (attribute) => attributes.get(attribute) ?? null,
    setAttribute: (attribute, attributeValue) => attributes.set(attribute, attributeValue),
    removeAttribute: (attribute) => attributes.delete(attribute),
    focus() {
      this.focused = true;
    },
  };
}

// Checkout keeps an empty cart so a field that passes validation stops at the fail-closed guard
// instead of resetting the form, leaving every validation attribute observable after submission.
function mountForm(fields, { checkout = true } = {}) {
  const status = { textContent: '', setAttribute() {} };
  const form = new EventTarget();
  Object.assign(form, {
    hasAttribute: (attribute) => checkout && attribute === 'data-checkout-form',
    querySelector: (selector) => {
      if (selector === '[data-form-status]') return status;
      if (selector === 'button[type="submit"]') return { disabled: true };
      return assert.fail(`unexpected form selector: ${selector}`);
    },
    querySelectorAll: () => fields,
    reset: () => assert.fail('a blocked or refused submission must not reset the form'),
  });
  vm.runInNewContext(`${initializer}\ninitForms();`, {
    document: { querySelectorAll: () => [form] },
    hasCartItems: () => false,
  });
  return {
    status,
    submit() {
      const event = new Event('submit', { cancelable: true });
      form.dispatchEvent(event);
      return event;
    },
  };
}

const zipField = (value) =>
  makeField({ name: 'zip', value, type: zip.type, pattern: zip.pattern, title: zip.title });

const phonePartial = await fs.readFile(
  new URL('../../src/partials/phone-field.html', import.meta.url),
  'utf8'
);
const phone = {
  pattern: phonePartial.match(/\bpattern="([^"]+)"/)?.[1],
  title: phonePartial.match(/\btitle="([^"]+)"/)?.[1],
};
assert.ok(phone.pattern && phone.title, 'the shared partial declares the phone pattern and title');

const phoneField = (value) =>
  makeField({
    name: 'phone',
    value,
    type: 'tel',
    pattern: phone.pattern,
    title: phone.title,
    minLength: 7,
  });

test('the checkout postal-code field publishes a pattern and user-facing format guidance', () => {
  assert.equal(zip.type, 'text');
  assert.equal(zip.pattern, '^[0-9]{2}-?[0-9]{3}$', 'the declared postal-code format is intact');
  assert.ok(zip.title, 'the field carries title guidance for its declared format');
  assert.doesNotMatch(zip.title, /[[\]{}\\^$]/, 'guidance is prose, not the raw expression');
  assert.match(checkoutSource, /\bname="zip"/, 'the field is authored in the page source');
});

test('invalid postal codes are rejected by the scripted validation flow', () => {
  for (const value of ['0-000', '0000', '000000', 'AA-123', '12-34A', '00 000', '123-45', '1']) {
    const field = zipField(value);
    assert.equal(field.validity.patternMismatch, true, `${value}: browser reports a mismatch`);
    const form = mountForm([field]);
    assert.equal(form.submit().defaultPrevented, true, `${value}: submission is blocked`);
    assert.equal(form.status.textContent, INVALID_MESSAGE, `${value}: status reports errors`);
    assert.equal(field.getAttribute('aria-invalid'), 'true', `${value}: aria-invalid`);
    assert.equal(field.error.hidden, false, `${value}: inline error is shown`);
    assert.equal(field.error.textContent, `Podaj wartość w poprawnym formacie. ${zip.title}`);
    assert.equal(field.getAttribute('aria-describedby'), field.error.id, `${value}: described by`);
    assert.equal(field.focused, true, `${value}: focus moves to the first invalid field`);
  }
});

test('valid postal codes reach the checkout guard without a pattern error', () => {
  for (const value of ['00-000', '00000', '12-345', '98765', '01-234']) {
    const field = zipField(value);
    assert.equal(field.validity.patternMismatch, false, `${value}: no native mismatch`);
    const form = mountForm([field]);
    assert.equal(form.submit().defaultPrevented, true, `${value}: checkout cancels natively`);
    assert.equal(form.status.textContent, EMPTY_CART_MESSAGE, `${value}: validation passed`);
    assert.equal(field.getAttribute('aria-invalid'), 'false', `${value}: aria-invalid`);
    assert.equal(field.error.hidden, true, `${value}: no inline error`);
    assert.equal(field.error.textContent, '', `${value}: no error text`);
    assert.equal(field.getAttribute('aria-describedby'), null, `${value}: no error description`);
    assert.equal(field.focused, false, `${value}: focus is not stolen`);
  }
});

test('an empty postal code still reports the required message, not a format error', () => {
  const field = zipField('');
  const form = mountForm([field]);
  assert.equal(form.submit().defaultPrevented, true);
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(field.error.textContent, 'To pole jest wymagane.');
});

test('an optional patterned field left blank raises no format error', () => {
  const field = makeField({
    name: 'optionalCode',
    value: '   ',
    pattern: '[A-Z]{3}',
    required: false,
  });
  assert.equal(field.validity.patternMismatch, true, 'the raw value would mismatch natively');
  const form = mountForm([field], { checkout: false });
  assert.equal(form.submit().defaultPrevented, false);
  assert.equal(field.getAttribute('aria-invalid'), 'false');
  assert.equal(field.error.hidden, true);
});

test('any declared pattern is enforced without a field-specific validator', () => {
  // A field name the code has never seen proves the mechanism is generic, not a registry.
  for (const [value, expected] of [
    ['ABC', true],
    ['XYZ', true],
    ['abc', false],
    ['ABCD', false],
    ['AB', false],
    ['A1C', false],
  ]) {
    const field = makeField({
      name: 'fixtureCode',
      value,
      pattern: '[A-Z]{3}',
      title: 'Trzy wielkie litery.',
    });
    const form = mountForm([field], { checkout: false });
    assert.equal(form.submit().defaultPrevented, !expected, `${value}: submission`);
    assert.equal(field.getAttribute('aria-invalid'), String(!expected), `${value}: aria-invalid`);
    assert.equal(
      field.error.textContent,
      expected ? '' : 'Podaj wartość w poprawnym formacie. Trzy wielkie litery.',
      `${value}: inline error`
    );
  }
});

test('a patterned field without guidance still reports a usable format error', () => {
  const field = makeField({ name: 'fixtureBare', value: 'abc', pattern: '[A-Z]{3}' });
  const form = mountForm([field], { checkout: false });
  assert.equal(form.submit().defaultPrevented, true);
  assert.equal(field.error.textContent, 'Podaj wartość w poprawnym formacie.');
});

test('the shared phone field keeps its own wording through the same pattern path', () => {
  for (const value of [
    '533 537 091',
    '+48 533 537 091',
    '533537091',
    '+48533537091',
    '533-537-091',
    '533\u00a0537\u00a0091',
    '1234567',
  ]) {
    const field = phoneField(value);
    const form = mountForm([field], { checkout: false });
    assert.equal(form.submit().defaultPrevented, false, `${value}: accepted`);
    assert.equal(field.getAttribute('aria-invalid'), 'false', `${value}: aria-invalid`);
    assert.equal(field.error.textContent, '', `${value}: no error`);
  }

  for (const value of ['abc12345', '533+537091', '1'.repeat(21), String.raw`533\537\091`]) {
    const field = phoneField(value);
    const form = mountForm([field], { checkout: false });
    assert.equal(form.submit().defaultPrevented, true, `${value}: rejected`);
    assert.equal(field.error.textContent, PHONE_MESSAGE, `${value}: phone wording is unchanged`);
    assert.notEqual(field.error.textContent, `Podaj wartość w poprawnym formacie. ${phone.title}`);
  }

  // A too-short value fails the pattern first, so the phone wording still wins over minlength.
  const short = phoneField('123456');
  const form = mountForm([short], { checkout: false });
  assert.equal(form.submit().defaultPrevented, true);
  assert.equal(short.error.textContent, PHONE_MESSAGE);
});

test('surrounding whitespace never decides an otherwise-valid phone number', () => {
  // The raw control value is exactly what the browser reads a mismatch on, so these are the
  // values that need the telephone field's trimmed reading to stay accepted.
  for (const value of [
    ' 533 537 091',
    ' +48 533 537 091 ',
    '  533537091  ',
    ' 533-537-091 ',
    '\t533 537 091\t',
    ' 533\u00a0537\u00a0091 ',
    ' 1234567 ',
  ]) {
    const label = JSON.stringify(value);
    const field = phoneField(value);
    assert.equal(field.validity.patternMismatch, true, `${label}: the raw value mismatches`);
    const form = mountForm([field], { checkout: false });
    assert.equal(form.submit().defaultPrevented, false, `${label}: accepted`);
    assert.equal(field.getAttribute('aria-invalid'), 'false', `${label}: aria-invalid`);
    assert.equal(field.error.textContent, '', `${label}: no inline error`);
    assert.equal(field.value, value, `${label}: the typed value is never rewritten`);
  }

  // A lone trailing space already satisfied the declared class, and still does.
  for (const value of ['533 537 091 ', '533537091 ']) {
    const label = JSON.stringify(value);
    const field = phoneField(value);
    assert.equal(field.validity.patternMismatch, false, `${label}: the raw value matches`);
    const form = mountForm([field], { checkout: false });
    assert.equal(form.submit().defaultPrevented, false, `${label}: accepted`);
    assert.equal(field.value, value, `${label}: the typed value is never rewritten`);
  }
});

test('trimming never rescues a malformed phone number', () => {
  for (const value of [
    ' abc12345 ',
    ' 533+537091 ',
    ' 533s537s091 ',
    ` ${String.raw`533\537\091`} `,
    ' 123456 ',
    ` ${'1'.repeat(21)} `,
    ' +48 533 537 09! ',
  ]) {
    const label = JSON.stringify(value);
    const field = phoneField(value);
    const form = mountForm([field], { checkout: false });
    assert.equal(form.submit().defaultPrevented, true, `${label}: rejected`);
    assert.equal(field.getAttribute('aria-invalid'), 'true', `${label}: aria-invalid`);
    assert.equal(field.error.textContent, PHONE_MESSAGE, `${label}: phone wording is preserved`);
    assert.equal(field.value, value, `${label}: the typed value is never rewritten`);
  }

  // Whitespace alone is still an empty required field, not a format complaint.
  const blank = phoneField('   ');
  const form = mountForm([blank], { checkout: false });
  assert.equal(form.submit().defaultPrevented, true);
  assert.equal(blank.error.textContent, 'To pole jest wymagane.');
  assert.equal(blank.value, '   ', 'the typed value is never rewritten');
});

test('the postal code keeps the raw browser-backed reading of its pattern', () => {
  for (const value of [' 00-000', '00-000 ', ' 00000 ', ' 12-345']) {
    const label = JSON.stringify(value);
    const field = zipField(value);
    assert.equal(field.validity.patternMismatch, true, `${label}: the raw value mismatches`);
    const form = mountForm([field]);
    assert.equal(form.submit().defaultPrevented, true, `${label}: blocked`);
    assert.equal(field.getAttribute('aria-invalid'), 'true', `${label}: aria-invalid`);
    assert.equal(field.error.textContent, `Podaj wartość w poprawnym formacie. ${zip.title}`);
  }
});

test('the trimmed reading is scoped to telephone fields alone', () => {
  for (const type of ['text', 'search']) {
    const field = makeField({
      name: 'fixtureCode',
      value: ' ABC ',
      type,
      pattern: '[A-Z]{3}',
      title: 'Trzy wielkie litery.',
    });
    const form = mountForm([field], { checkout: false });
    assert.equal(form.submit().defaultPrevented, true, `${type}: padded value still mismatches`);
    assert.equal(
      field.error.textContent,
      'Podaj wartość w poprawnym formacie. Trzy wielkie litery.',
      `${type}: inline error`
    );
  }
});

test('email keeps its own validator ahead of any declared pattern', () => {
  const field = makeField({ name: 'email', value: 'not-an-email', type: 'email' });
  const form = mountForm([field], { checkout: false });
  assert.equal(form.submit().defaultPrevented, true);
  assert.equal(field.error.textContent, 'Podaj poprawny adres e-mail.');
});

test('the custom flow keeps native submit validation disabled', () => {
  const form = new EventTarget();
  Object.assign(form, {
    noValidate: false,
    hasAttribute: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  vm.runInNewContext(`${initializer}\ninitForms();`, {
    document: { querySelectorAll: () => [form] },
  });
  assert.equal(form.noValidate, true, 'the project keeps its own validation UI');
});
