import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';
import { isNewProduct } from '../../js/features/products.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = await fs.readFile(new URL('../../index.html', import.meta.url), 'utf8');
const html = await renderHtml(root, 'index.html', source);
const catalog = JSON.parse(
  await fs.readFile(new URL('../../public/data/products.json', import.meta.url), 'utf8')
);
// A .stat block wraps no nested element boxes, so it ends at its own first closing div.
const STAT_BLOCK = /<div class="stat">([\s\S]*?)<\/div>/g;
const textContent = (markup) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const heroCardStart = html.indexOf('<div class="hero-card"');
assert.notEqual(heroCardStart, -1, 'the homepage renders a hero card');
const heroSection = html.slice(heroCardStart, html.indexOf('</section>', heroCardStart));
const statistics = [...heroSection.matchAll(STAT_BLOCK)].map(([, block]) => ({
  figure: textContent(block.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? ''),
  label: textContent(block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? ''),
}));

test('the hero card matches the three catalog-derived statistics, in order', () => {
  assert.equal(statistics.length, 3);
  assert.deepEqual(statistics, [
    { figure: String(catalog.length), label: 'Produktów w katalogu' },
    {
      figure: String(new Set(catalog.map((product) => product.category)).size),
      label: 'Kategorii',
    },
    { figure: String(catalog.filter(isNewProduct).length), label: 'Nowości' },
  ]);
});

test('canonical products contain no obsolete rating field', () => {
  for (const product of catalog) {
    assert.equal(Object.hasOwn(product, 'rating'), false, `${product.id} must not contain rating`);
  }
});

test('no hero statistic repeats another figure or label', () => {
  const pairs = statistics.map(({ figure, label }) => `${figure}\u0000${label}`);
  assert.equal(new Set(pairs).size, statistics.length, 'every figure and label pair is distinct');
  assert.equal(
    new Set(statistics.map(({ figure }) => figure)).size,
    statistics.length,
    'every figure is distinct'
  );
  assert.equal(
    new Set(statistics.map(({ label }) => label)).size,
    statistics.length,
    'every label is distinct'
  );
});

test('the stats grid belongs to the hero card alone, which keeps the CSS hero-scoped', () => {
  assert.equal([...html.matchAll(STAT_BLOCK)].length, statistics.length);
  assert.equal(html.split('<div class="stats">').length - 1, 1);
  assert.ok(
    heroSection.includes('<div class="stats">'),
    'the stats grid sits inside the hero card'
  );
});
