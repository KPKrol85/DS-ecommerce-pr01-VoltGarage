import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://volt-garage.invalid';
const SHARED_SHELL =
  '<!-- @include src/partials/header.html --><!-- @include src/partials/footer.html -->';
// The shared shell renders at every document depth, and root-absolute on a fallback document,
// so each entry is checked wherever rootPrefix and pagesPrefix can place its destination.
const DOCUMENTS = ['index.html', 'thank-you.html', 'pages/shop.html', '404.html'];
// A long anchor is wrapped, which leaves its closing tag split as "</a" and the ">" that ends it.
const ANCHOR = /<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a\s*>/gi;
// The storefront holds no delivery or returns document. Until one exists, naming either topic in
// the shared navigation promises content that the destination does not contain.
const REMOVED_ENTRIES = [
  ['Dostawa', '/pages/checkout.html'],
  ['Zwroty', '/pages/cart.html'],
];
// Every shared destination whose label the page it opens actually answers.
const KEPT_ENTRIES = [
  ['Strona główna', '/index.html'],
  ['Wszystkie produkty', '/pages/shop.html'],
  ['Nowości', '/pages/new-arrivals.html'],
  ['Produkt', '/pages/product.html'],
  ['Kolekcje / Kategorie', '/pages/collections.html'],
  ['Promocje', '/pages/promotions.html'],
  ['Formularz', '/pages/contact.html'],
  ['Kontakt', '/pages/contact.html'],
  ['Polityka prywatności', '/pages/privacy-policy.html'],
  ['Cookies', '/pages/cookies.html'],
  ['Regulamin', '/pages/terms.html'],
];

const source = (file) => fs.readFile(path.join(ROOT, file), 'utf8');
const render = async (file, markup) => renderHtml(ROOT, file, markup ?? (await source(file)));
const label = (markup) =>
  markup
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// A navigation entry is the label a visitor reads paired with the route it actually opens.
const entriesIn = (markup, file) =>
  [...markup.matchAll(ANCHOR)]
    .map((match) => ({ href: match[1], label: label(match[2]) }))
    .filter((entry) => entry.href.split(/[?#]/)[0].endsWith('.html'))
    .map((entry) => ({ ...entry, route: new URL(entry.href, `${ORIGIN}/${file}`).pathname }));

const sharedEntries = async (file) => entriesIn(await render(file, SHARED_SHELL), file);

test('the shared navigation names no topic its destination does not contain', async () => {
  for (const file of DOCUMENTS) {
    const entries = await sharedEntries(file);
    assert.ok(entries.length > 0, `${file}: the shared shell should render its navigation`);
    for (const [name, route] of REMOVED_ENTRIES) {
      assert.ok(
        !entries.some((entry) => entry.label === name && entry.route === route),
        `${file}: the shared navigation still maps "${name}" to ${route}`
      );
      assert.ok(
        !entries.some((entry) => entry.label === name),
        `${file}: the shared navigation still offers a "${name}" entry`
      );
    }
  }
});

test('the shared navigation keeps every destination that answers its label', async () => {
  for (const file of DOCUMENTS) {
    const entries = await sharedEntries(file);
    for (const [name, route] of KEPT_ENTRIES) {
      assert.ok(
        entries.some((entry) => entry.label === name && entry.route === route),
        `${file}: the shared navigation lost "${name}" -> ${route}`
      );
    }
  }
});

// Checkout was reachable from the shared shell only through the removed "Dostawa" entry.
test('checkout left the shared navigation but is still reached from the cart', async () => {
  const routes = new Set((await sharedEntries('index.html')).map((entry) => entry.route));
  assert.ok(!routes.has('/pages/checkout.html'), 'checkout is not a shared navigation topic');
  assert.ok(routes.has('/pages/cart.html'), 'the cart control should survive in the header');
  const cart = entriesIn(await render('pages/cart.html'), 'pages/cart.html');
  assert.ok(
    cart.some((entry) => entry.route === '/pages/checkout.html'),
    'the cart should still lead to checkout'
  );
});
