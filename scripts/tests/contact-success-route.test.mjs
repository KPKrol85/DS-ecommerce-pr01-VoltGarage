import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverHtml, renderHtml } from '../html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://volt-garage.invalid';
// The contact form is the project's one real submission. Netlify serves the document named by the
// form's own `action` after a successful POST, so the branded confirmation page is reached through
// that submission and through nothing else: it stays out of the sitemap and out of every
// navigation surface, and it confirms a message rather than an order the project never creates.
const SUCCESS_DOCUMENT = 'thank-you.html';
const SUCCESS_ROUTE = `/${SUCCESS_DOCUMENT}`;
const CONTACT_DOCUMENT = 'pages/contact.html';
const CHECKOUT_DOCUMENT = 'pages/checkout.html';
const FORM = /<form\b[^>]*>[\s\S]*?<\/form>/gi;
const OPENING_TAG = /<form\b[^>]*>/;
const HREF = /\bhref\s*=\s*"([^"]*)"/gi;
const HOURS = /(\d+)\s*(?:h\b|godz)/gi;

const source = (file) => fs.readFile(path.join(ROOT, file), 'utf8');
const render = async (file) => renderHtml(ROOT, file, await source(file));
const openingOf = (form) => form.match(OPENING_TAG)[0];
const formIn = (markup, hook) => {
  const form = [...markup.matchAll(FORM)]
    .map(([match]) => match)
    .find((candidate) => openingOf(candidate).includes(hook));
  assert.ok(form, `a form marked ${hook} is rendered`);
  return form;
};
const mainOf = (markup, file) => {
  const main = markup.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0];
  assert.ok(main, `${file}: the document renders its main region`);
  return main;
};
const textContent = (markup) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const isSiteLink = (href) => href !== '' && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href);

const contactSource = await source(CONTACT_DOCUMENT);
const contact = await render(CONTACT_DOCUMENT);
const successPage = await render(SUCCESS_DOCUMENT);
const successMain = mainOf(successPage, SUCCESS_DOCUMENT);

test('source and rendered contact keep the native Netlify POST and name a success destination', () => {
  for (const [label, markup] of [
    ['source', contactSource],
    ['rendered', contact],
  ]) {
    const form = formIn(markup, 'data-contact-form');
    const opening = openingOf(form);
    assert.match(opening, /\bname="contact"/, label);
    assert.match(opening, /\bmethod="POST"/, label);
    assert.match(opening, /\bdata-netlify="true"/, label);
    assert.match(opening, /\snetlify(?:\s|>)/, label);
    assert.match(opening, /\baction="[^"]+"/, label);
    assert.match(form, /<input\b[^>]*\bname="form-name"[^>]*\bvalue="contact"/, label);
    // A scripted simulation would replace the real submission this contract depends on.
    assert.doesNotMatch(opening, /\s(?:novalidate|onsubmit|data-checkout-form)\b/, label);
  }
});

test('the declared success destination resolves to the branded page from any contact URL', () => {
  const action = openingOf(formIn(contact, 'data-contact-form')).match(/\baction="([^"]*)"/)?.[1];
  assert.equal(action, SUCCESS_ROUTE, 'the root-level document is addressed from the site root');
  for (const base of [
    `${ORIGIN}/${CONTACT_DOCUMENT}`,
    `${ORIGIN}/pages/nested/contact.html`,
    `${ORIGIN}/contact.html`,
  ]) {
    assert.equal(new URL(action, base).pathname, SUCCESS_ROUTE, base);
  }
});

test('the success destination is a build entry holding the confirmation page', async () => {
  assert.ok(discoverHtml(ROOT).includes(SUCCESS_DOCUMENT), 'the success page is a Vite HTML entry');
  assert.ok((await fs.stat(path.join(ROOT, SUCCESS_DOCUMENT))).isFile(), 'the source file exists');
  assert.match(successPage, /<title>Dziękujemy \| VOLT GARAGE<\/title>/);
  assert.match(successMain, /<h1\b[^>]*\bid="status-title"/);
  assert.match(textContent(successMain), /Wiadomość/);
});

test('the success page stays unindexed and unadvertised', async () => {
  const robots = successPage.match(/<meta\s+name="robots"\s+content="([^"]*)"/i)?.[1];
  assert.equal(robots, 'noindex,follow', 'post-submit content is followed but never indexed');
  const sitemap = await fs.readFile(path.join(ROOT, 'public/sitemap.xml'), 'utf8');
  const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, location]) => new URL(location).pathname
  );
  assert.ok(routes.length > 0, 'the sitemap advertises the public routes');
  assert.ok(!routes.includes(SUCCESS_ROUTE), 'the sitemap must not advertise the success page');
});

test('no ordinary navigation anywhere links to the success page', async () => {
  for (const file of discoverHtml(ROOT)) {
    const markup = await render(file);
    for (const [, href] of markup.matchAll(HREF)) {
      if (!isSiteLink(href)) continue;
      assert.notEqual(
        new URL(href, `${ORIGIN}/${file}`).pathname,
        SUCCESS_ROUTE,
        `${file}: "${href}" links to the success page, which submission alone should reach`
      );
    }
  }
});

test('the demonstration checkout shares no part of the contact success contract', async () => {
  const checkout = await render(CHECKOUT_DOCUMENT);
  const checkoutForm = formIn(checkout, 'data-checkout-form');
  assert.doesNotMatch(checkoutForm, /\b(?:action|formaction|method|formmethod)\s*=/);
  assert.doesNotMatch(checkoutForm, /\bnetlify\b/);
  assert.doesNotMatch(checkoutForm, /\bdata-contact-form\b/);
  assert.ok(!checkout.includes(SUCCESS_DOCUMENT), 'the simulated checkout owns no success route');
  assert.doesNotMatch(formIn(contact, 'data-contact-form'), /\bdata-checkout-form\b/);
});

test('the success page confirms a sent message, never an order', () => {
  const confirmation = textContent(successMain);
  // The project has no commerce backend and no order persistence, so it issues no order numbers.
  assert.doesNotMatch(confirmation, /zamówieni/i);
  assert.doesNotMatch(confirmation, /płatnoś|faktur/i);
});

test('any response window the success page states is one the contact page already publishes', () => {
  const hours = (markup) => [...textContent(markup).matchAll(HOURS)].map(([, value]) => value);
  const published = hours(mainOf(contact, CONTACT_DOCUMENT));
  for (const promised of hours(successMain)) {
    assert.ok(
      published.includes(promised),
      `the success page promises ${promised} h, which ${CONTACT_DOCUMENT} does not publish`
    );
  }
});
