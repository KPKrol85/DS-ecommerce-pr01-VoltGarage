import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function render(filename) {
  const source = await fs.readFile(new URL(`../../${filename}`, import.meta.url), 'utf8');
  return renderHtml(root, filename, source);
}
const contact = await render('pages/contact.html');
const policy = await render('pages/privacy-policy.html');
const form = contact.match(/<form\b[^>]*\bdata-contact-form[^>]*>[\s\S]*?<\/form>/)?.[0];
assert.ok(form, 'the contact form is rendered');
const textContent = (markup) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
function section(id) {
  const markup = policy.match(
    new RegExp(`<section\\b[^>]*aria-labelledby="${id}"[^>]*>[\\s\\S]*?</section>`)
  )?.[0];
  assert.ok(markup, `${id} is rendered`);
  return markup;
}

test('contact keeps its Netlify fields and required data categories covered by the policy', () => {
  const opening = form.match(/<form\b[^>]*>/)[0];
  assert.match(opening, /\bname="contact"/);
  assert.match(opening, /\bmethod="POST"/);
  assert.match(opening, /\bdata-netlify="true"/);
  assert.match(opening, /\snetlify(?:\s|>)/);
  assert.doesNotMatch(opening, /\s(?:novalidate|onsubmit|data-checkout-form)\b/);
  const fields = [...form.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map(([tag]) => tag);
  const names = fields.map((tag) => tag.match(/\bname="([^"]+)"/)?.[1]);
  assert.deepEqual(names, [
    'form-name',
    'name',
    'last-name',
    'email',
    'phone',
    'subject',
    'message',
  ]);
  assert.match(fields[0], /\btype="hidden"/);
  assert.match(fields[0], /\bvalue="contact"/);
  const categories = {
    name: /imię/i,
    'last-name': /\bnazwisko\b/i,
    email: /adres e-mail/i,
    phone: /numer telefonu/i,
    message: /treść wiadomości/i,
  };
  const scope = section('pp-3');
  const requiredList = scope.match(/<p>[^<]*wymaga[^<]*<\/p>\s*<ul>([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(requiredList, 'the policy identifies the required contact data');
  for (const [name, category] of Object.entries(categories)) {
    assert.match(fields[names.indexOf(name)], /\srequired(?:\s|\/?>)/, name);
    assert.match(textContent(requiredList), category, name);
  }
  assert.doesNotMatch(fields[names.indexOf('subject')], /\srequired(?:\s|\/?>)/);
  assert.match(textContent(scope), /opcjonaln\w* temat/i);
  assert.match(textContent(scope), /informacje dobrowolnie podane[^.]*wiadomości/i);
  assert.doesNotMatch(form, /\btype="checkbox"/);
});

test('a static privacy disclosure and direct policy link immediately precede submission', () => {
  const notice = form.match(/<p\b[^>]*>([\s\S]*?)<\/p>\s*<button\b[^>]*type="submit"/i)?.[1];
  assert.ok(notice, 'a paragraph is adjacent to the submit button');
  assert.match(textContent(notice), /dane[^.]*obsłu(?:gi|dze) zapytania/i);
  const href = notice.match(/<a\b[^>]*href="([^"]+)"[^>]*>/)?.[1];
  assert.equal(href, 'privacy-policy.html');
  assert.equal(
    new URL(href, 'https://example.test/pages/contact.html').pathname,
    '/pages/privacy-policy.html'
  );
  const button = form.match(/<button\b[^>]*>/)[0];
  assert.doesNotMatch(button, /\sdisabled(?:\s|>)/);
});

test('the policy separates demo checkout data from real Netlify contact submissions', () => {
  const paragraphs = [...section('pp-2').matchAll(/<p>([\s\S]*?)<\/p>/g)].map(([, p]) =>
    textContent(p)
  );
  const checkout = paragraphs.find((p) => /checkout/i.test(p));
  assert.ok(checkout, 'checkout has an explicit disclosure');
  assert.match(checkout, /demonstrac/i);
  assert.match(checkout, /nie są wysyłane ani zapisywane/i);
  const realContact = paragraphs.find((p) => /formularz kontaktowy/i.test(p));
  assert.ok(realContact, 'contact has a separate disclosure');
  assert.match(realContact, /Netlify Forms/);
  assert.match(realContact, /przesyła[^.]*obsługi zapytania/i);
  assert.doesNotMatch(realContact, /testow/i);
  assert.doesNotMatch(
    paragraphs.join(' '),
    /dane wprowadzane w formularzach mają charakter testowy/i
  );
  assert.match(
    paragraphs.join(' '),
    /nie powinien podawać danych wrażliwych ani informacji poufnych/i
  );
});

test('the policy does not equate voluntary form submission with captured consent', () => {
  const bases = textContent(section('pp-4'));
  assert.doesNotMatch(bases, /zgoda[\s\S]*dobrowolnego przesłania/i);
  assert.match(bases, /prawnie uzasadniony interes[\s\S]*obsługi zapytań/i);
});
