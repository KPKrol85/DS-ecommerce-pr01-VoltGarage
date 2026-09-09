import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILE = 'pages/shop.html';
const SHIPPING_NOTICE = 'Darmowa wysyłka od 300 zł.';

// Read the shop page exactly as Vite renders it, so the panel is inspected in document order.
const source = await fs.readFile(path.join(ROOT, FILE), 'utf8');
const shop = await renderHtml(ROOT, FILE, source);
const baseCss = await fs.readFile(path.join(ROOT, 'css/partials/base.css'), 'utf8');

const panel = shop.match(/<aside\b[^>]*\bclass="filter-panel"[^>]*>[\s\S]*?<\/aside\s*>/)?.[0];
assert.ok(panel, 'the shop page renders the filter panel');
const panelTag = panel.match(/<aside\b[^>]*>/)[0];

const attribute = (tag, name) =>
  tag.match(new RegExp(String.raw`\s${name}="([^"]*)"`))?.[1] ?? null;
const element = (id) =>
  shop.match(
    new RegExp(String.raw`<([a-z][a-z0-9]*)\b[^>]*\sid="${id}"[^>]*>([\s\S]*?)</\1\s*>`, 'i')
  );
const textContent = (markup) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const labelledBy = attribute(panelTag, 'aria-labelledby');
const panelLabel = labelledBy ? element(labelledBy) : null;

test('the filter panel is named by its own heading, not by the results heading', () => {
  assert.match(panelTag, /^<aside\b/, 'the filters must stay a complementary region');
  assert.ok(labelledBy, 'the filter panel must keep an accessible name');
  assert.notEqual(labelledBy, 'filter-heading', 'the panel still borrows the results heading');
  assert.ok(panelLabel, `#${labelledBy} must be rendered`);
  assert.match(panelLabel[1], /^h[1-6]$/i, 'the panel should be named by a real heading');
  assert.match(textContent(panelLabel[2]), /filtr/i, 'the name must describe product filtering');
  assert.ok(panel.includes(panelLabel[0]), 'the panel label must live inside the panel');
  assert.notEqual(
    textContent(panelLabel[2]),
    textContent(element('filter-heading')[2]),
    'the filter panel and the results area must not share one accessible name'
  );
  assert.ok(panelTag.includes('data-reveal'), 'the reveal hook was lost');
});

test('the free-shipping notice is intact and no longer describes the filter panel', () => {
  assert.equal(attribute(panelTag, 'aria-describedby'), null);
  assert.doesNotMatch(shop, /aria-describedby="[^"]*\bfilter-summary\b[^"]*"/);
  const notice = element('filter-summary');
  assert.ok(notice, 'the shipping notice must stay in the page');
  assert.equal(textContent(notice[2]), SHIPPING_NOTICE, 'the notice copy changed');
  assert.doesNotMatch(notice[0], /\s(?:hidden|aria-hidden)[\s=>]/, 'the notice must stay visible');
  assert.ok(!panel.includes(notice[0]), 'the notice stays outside the filter panel');
});

test('the results area keeps the Produkty heading and its polite result count', () => {
  const heading = element('filter-heading');
  assert.ok(heading, '#filter-heading must be rendered');
  assert.equal(heading[1].toLowerCase(), 'h2', 'the results heading level changed');
  assert.equal(textContent(heading[2]), 'Produkty');
  assert.ok(!panel.includes(heading[0]), 'the results heading stays outside the filter panel');
  const count = shop.match(/<span\b[^>]*\bdata-result-count\b[^>]*>/)?.[0];
  assert.ok(count, 'the result counter must be rendered');
  assert.equal(attribute(count, 'aria-live'), 'polite', 'the result count lost its live region');
});

test('search suggestions stay native, with no live region on the datalist', () => {
  const input = shop.match(/<input\b[^>]*\bid="filter-search"[^>]*>/)?.[0];
  assert.ok(input, 'the search input must be rendered');
  assert.equal(attribute(input, 'type'), 'search');
  assert.equal(attribute(input, 'list'), 'search-suggestions');
  assert.equal(attribute(input, 'role'), null, 'the input must not become a custom combobox');
  assert.doesNotMatch(input, /\saria-(?:expanded|autocomplete|controls|activedescendant)\b/);
  const datalist = shop.match(/<datalist\b[^>]*>/)?.[0];
  assert.ok(datalist, 'the datalist must be rendered');
  assert.equal(attribute(datalist, 'id'), 'search-suggestions');
  assert.ok(datalist.includes('data-search-suggestions'), 'the runtime hook was lost');
  assert.doesNotMatch(datalist, /\saria-live\b/, 'a datalist never reaches the a11y tree');
});

test('every filter control keeps its own visible label', () => {
  for (const id of ['filter-search', 'filter-category', 'filter-price', 'filter-sort']) {
    const label = new RegExp(String.raw`<label\b[^>]*\sfor="${id}"[^>]*>`);
    assert.match(panel, label, `${id} lost its label`);
    assert.match(panel, new RegExp(String.raw`\sid="${id}"`), `${id} left the filter panel`);
  }
});

test('a hidden panel heading reuses the shared utility instead of new CSS', () => {
  const classes = (attribute(panelLabel[0].match(/<[^>]*>/)[0], 'class') ?? '').split(/\s+/);
  assert.ok(classes.includes('visually-hidden'), 'the heading should reuse the shared utility');
  assert.match(baseCss, /^\.visually-hidden\s*\{/m, 'the shared utility must stay defined');
});
