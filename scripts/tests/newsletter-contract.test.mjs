import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { discoverHtml, renderHtml } from '../html.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = await fs.readFile(new URL('../../index.html', import.meta.url), 'utf8');
const html = await renderHtml(root, 'index.html', source);
const sections = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)]
  .map(([section]) => section)
  .filter((section) => /newsletter|biuletyn/i.test(section));
assert.equal(sections.length, 1, 'exactly one newsletter/news section is rendered');
const section = sections[0];
const textContent = (markup) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('the rendered newsletter section has no form, data-entry fields, or submit controls', () => {
  assert.doesNotMatch(section, /<(?:form|input|textarea|select|button)\b/i);
  assert.doesNotMatch(section, /\s(?:contenteditable|formaction|onsubmit)\b/i);
  assert.doesNotMatch(section, /\brole\s*=\s*["'](?:button|textbox|form)["']/i);
});

test('the section explicitly discloses demo scope without promising registration', () => {
  const heading = section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
  assert.equal(textContent(heading || ''), 'Nowości VOLT GARAGE');
  assert.ok(
    textContent(section).includes(
      'Zapisy do newslettera nie są obsługiwane w tej wersji demonstracyjnej.'
    )
  );
  assert.doesNotMatch(textContent(section), /zapisz się|dołączam|subskrybuj|zarejestruj/i);
});

test('the section has exactly one ordinary CTA resolving to the existing new-arrivals route', async () => {
  const links = [...section.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  assert.equal(links.length, 1, 'exactly one navigation outcome');
  const [, attributes, label] = links[0];
  assert.equal(textContent(label), 'Zobacz nowości');
  assert.doesNotMatch(attributes, /\s(?:on\w+|target|download|role)\s*=/i);
  const href = attributes.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  assert.ok(href, 'CTA has a real href');
  for (const homepage of ['http://localhost/', 'http://localhost/index.html']) {
    assert.equal(new URL(href, homepage).href, 'http://localhost/pages/new-arrivals.html');
  }
  const route = 'pages/new-arrivals.html';
  assert.ok(discoverHtml(root).includes(route), 'CTA target is a Vite HTML entry');
  const target = new URL(`../../${route}`, import.meta.url);
  assert.ok((await fs.stat(target)).isFile(), 'CTA target exists as a source file');
  const renderedTarget = await renderHtml(root, route, await fs.readFile(target, 'utf8'));
  assert.match(renderedTarget, /<h1\b[^>]*>Nowości<\/h1>/);
});
