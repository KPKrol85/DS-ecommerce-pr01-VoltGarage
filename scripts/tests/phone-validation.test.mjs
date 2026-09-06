import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const partialPath = 'src/partials/phone-field.html';
const readSource = (filename) => fs.readFile(new URL(`../../${filename}`, import.meta.url), 'utf8');
const pages = await Promise.all(
  ['pages/contact.html', 'pages/checkout.html'].map(async (filename) => {
    const source = await readSource(filename);
    const html = await renderHtml(root, filename, source);
    const fields = [...html.matchAll(/<input\b[^>]*\bname="phone"[^>]*>/g)];
    assert.equal(fields.length, 1, `${filename}: exactly one phone field`);
    const input = fields[0][0];
    const pattern = input.match(/\bpattern="([^"]+)"/)?.[1];
    assert.ok(pattern, `${filename}: phone pattern is present`);
    return { filename, source, html, input, pattern };
  })
);

test('both forms render the required phone field from the same shared partial', async () => {
  const partial = (await readSource(partialPath)).trim();
  for (const { filename, source, html, input } of pages) {
    assert.equal(source.split(`<!-- @include ${partialPath} -->`).length - 1, 1, filename);
    assert.doesNotMatch(source, /<input\b[^>]*\b(?:name="phone"|type="tel")/);
    assert.ok(html.includes(partial), `${filename}: shared label/input is rendered intact`);
    for (const attribute of [
      'type="tel"',
      'autocomplete="tel"',
      'inputmode="tel"',
      'minlength="7"',
      'maxlength="20"',
      'aria-required="true"',
    ]) {
      assert.ok(input.includes(attribute), `${filename}: ${attribute}`);
    }
    assert.match(input, /\srequired(?:\s|\/?>)/);
  }
  assert.equal(pages[0].pattern, pages[1].pattern);
});

test('the rendered pattern accepts published, compact, and hyphenated phone formats', () => {
  for (const { filename, pattern } of pages) {
    assert.ok(pattern.includes(String.raw`\s`));
    assert.ok(!pattern.includes(String.raw`\\s`));
    // HTML pattern uses the v flag: a literal hyphen must be escaped in its class.
    for (const flags of ['', 'v']) {
      const regex = new RegExp(pattern, flags);
      for (const value of [
        '533 537 091',
        '+48 533 537 091',
        '533537091',
        '+48533537091',
        '533\u00a0537\u00a0091',
        '+48\u00a0533\u00a0537\u00a0091',
        '533-537-091',
        '+48-533-537-091',
        '1234567',
        '1'.repeat(20),
      ]) {
        assert.ok(regex.test(value), `${filename} /${flags}: ${value}`);
      }
    }
  }
});

test('the actual contact and footer telephone labels pass both regex modes', () => {
  const published = [
    ...pages[0].html.matchAll(/<a\b[^>]*href="tel:[^"]+"[^>]*>([\s\S]*?)<\/a>/g),
  ].map((match) =>
    match[1]
      .replace(/<[^>]*>/g, '')
      .replaceAll('&nbsp;', '\u00a0')
      .trim()
  );
  assert.ok(published.includes('533\u00a0537\u00a0091'));
  assert.ok(published.includes('+48\u00a0533\u00a0537\u00a0091'));
  for (const { pattern } of pages) {
    for (const value of published) {
      assert.ok(new RegExp(pattern).test(value), value);
      assert.ok(new RegExp(pattern, 'v').test(value), value);
    }
  }
});

test('both regex modes reject letters, literal backslashes, and out-of-range lengths', () => {
  for (const { filename, pattern } of pages) {
    for (const flags of ['', 'v']) {
      const regex = new RegExp(pattern, flags);
      for (const value of [
        '',
        '123456',
        '1'.repeat(21),
        'abc12345',
        '533s537s091',
        String.raw`533\537\091`,
        '533+537091',
      ]) {
        assert.equal(regex.test(value), false, `${filename} /${flags}: ${value}`);
      }
    }
  }
});

test('the old doubled-backslash pattern fails the published formats and admits s/backslashes', () => {
  const legacy = new RegExp(String.raw`^[0-9+][0-9\\s-]{6,19}$`);
  for (const value of ['533 537 091', '+48 533 537 091', '533\u00a0537\u00a0091']) {
    assert.equal(legacy.test(value), false);
    for (const { pattern } of pages) assert.ok(new RegExp(pattern).test(value));
  }
  for (const value of ['533s537s091', String.raw`533\537\091`]) {
    assert.ok(legacy.test(value));
    for (const { pattern } of pages) assert.equal(new RegExp(pattern).test(value), false);
  }
});
