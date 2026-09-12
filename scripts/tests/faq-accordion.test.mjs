import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverHtml, renderHtml } from '../html.mjs';
import { initFaq } from '../../js/ui/faq.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILE = 'pages/faq.html';
const ROUTE = '/pages/faq.html';
const TITLE = 'FAQ / Pomoc';
// A FAQ that answers fewer questions than this stops being worth its own route.
const MINIMUM_QUESTIONS = 10;
const TRIGGER = /<button\b[^>]*\bdata-faq-trigger\b[^>]*>([\s\S]*?)<\/button\s*>/g;
const ANSWER = /<div\b[^>]*\bdata-faq-answer\b[^>]*>/g;

const faqSource = await fs.readFile(path.join(ROOT, FILE), 'utf8');
const faq = await renderHtml(ROOT, FILE, faqSource);
const moduleSource = await fs.readFile(path.join(ROOT, 'js/ui/faq.js'), 'utf8');
const pagesCss = await fs.readFile(path.join(ROOT, 'css/partials/pages.css'), 'utf8');

const attribute = (tag, name) =>
  tag.match(new RegExp(String.raw`\s${name}="([^"]*)"`))?.[1] ?? null;
const textContent = (markup) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const triggers = [...faq.matchAll(TRIGGER)].map(([tag, body]) => ({
  tag: tag.match(/<button\b[^>]*>/)[0],
  question: textContent(body),
}));
const answerTags = [...faq.matchAll(ANSWER)].map(([tag]) => tag);

test('the FAQ is a build entry, a sitemap route, and the page the navigation promises', async () => {
  assert.ok(discoverHtml(ROOT).includes(FILE), 'the FAQ must be a Vite HTML entry');
  const sitemap = await fs.readFile(path.join(ROOT, 'public/sitemap.xml'), 'utf8');
  const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, location]) => new URL(location).pathname
  );
  assert.ok(routes.includes(ROUTE), 'the sitemap should advertise the FAQ');
  assert.equal(routes.filter((route) => route === ROUTE).length, 1, 'one entry per route');
  const canonical = faq.match(/<link\b[^>]*\brel="canonical"[^>]*>/)?.[0];
  assert.ok(canonical, 'the page must publish a canonical URL');
  assert.equal(new URL(attribute(canonical, 'href')).pathname, ROUTE);
  const description = faq.match(/<meta\b[^>]*\bname="description"[^>]*>/)?.[0];
  assert.ok(description, 'the page must publish a meta description');
  assert.ok(attribute(description, 'content').length > 50, 'the description should say something');
  assert.match(faq, new RegExp(String.raw`<title>${TITLE} \| VOLT GARAGE`));
});

test('the page reuses the shared hero, and its h1 and breadcrumb name the same page', () => {
  const hero = faq.match(/<section class="page-hero">[\s\S]*?<\/section>/)?.[0];
  assert.ok(hero, 'the FAQ should reuse the shared page hero');
  assert.match(hero, /<span class="page-hero-mark" aria-hidden="true"><\/span>/);
  assert.equal(textContent(hero.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]), TITLE);
  assert.ok(textContent(hero.match(/<p>([\s\S]*?)<\/p>/)[1]).length > 40, 'the hero needs a lead');
  // No hero artwork of its own: the watermark and gradient are the shared treatment.
  assert.ok(!hero.includes('<img'), 'the hero must not introduce artwork of its own');
  const crumbs = faq.match(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/)[0];
  assert.match(textContent(crumbs), new RegExp(`Strona główna ${TITLE}$`));
});

test('the accordion renders at least ten questions, each a real button with a unique answer', () => {
  assert.ok(
    triggers.length >= MINIMUM_QUESTIONS,
    `the FAQ renders ${triggers.length} questions, fewer than ${MINIMUM_QUESTIONS}`
  );
  assert.equal(answerTags.length, triggers.length, 'every question needs exactly one answer');

  const ids = [...faq.matchAll(/\sid="([^"]*)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id in the rendered document');

  const controlled = new Set();
  for (const { tag, question } of triggers) {
    // A native button carries Enter and Space itself, so the module adds no key handling.
    assert.equal(attribute(tag, 'type'), 'button', `${question}: the trigger must be a button`);
    assert.doesNotMatch(tag, /\srole=|\stabindex=/, `${question}: the button was redressed`);
    assert.ok(question.length > 10, 'a question should read as one');

    const controls = attribute(tag, 'aria-controls');
    assert.ok(controls, `${question}: the trigger must name the answer it controls`);
    assert.ok(!controlled.has(controls), `${controls}: two triggers control one answer`);
    controlled.add(controls);

    const answer = faq.match(new RegExp(String.raw`<div\b[^>]*\sid="${controls}"[^>]*>`))?.[0];
    assert.ok(answer, `${question}: aria-controls points at no rendered element`);
    assert.ok(answer.includes('data-faq-answer'), `${controls}: the runtime hook is missing`);
    assert.ok(attribute(tag, 'id'), `${question}: the trigger needs an id of its own`);
  }
});

// The page is readable before the module runs and for a visitor whose JavaScript never arrives,
// so what ships is the open state - and aria-expanded says so truthfully at that moment.
test('every answer ships expanded, with no answer hidden by the document itself', () => {
  for (const { tag, question } of triggers) {
    assert.equal(attribute(tag, 'aria-expanded'), 'true', `${question}: unexpected initial state`);
  }
  for (const tag of answerTags) {
    assert.doesNotMatch(tag, /\shidden[\s=>]/, 'an answer is unreachable without scripting');
    assert.doesNotMatch(tag, /\saria-hidden=/, 'an answer is hidden from assistive technology');
    assert.doesNotMatch(tag, /\sstyle=/, 'the collapsed state belongs to the stylesheet');
  }
  // The collapsed state has to leave the accessibility tree and the tab order, not just the
  // screen, and a grid answer would otherwise outrank the user agent's own hidden rule.
  assert.match(pagesCss, /\.faq-item__answer\[hidden\] \{\s*display: none;\s*\}/);
  assert.doesNotMatch(
    pagesCss,
    /\.faq-item__answer\[hidden\] \{[^}]*opacity: 0/,
    'a collapsed answer must not be merely transparent'
  );
});

test('the heading outline nests questions under the group each belongs to', () => {
  const main = faq.match(/<main\b[^>]*>[\s\S]*?<\/main>/)[0];
  const headings = [...main.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/g)].map(
    ([, level, body]) => ({ level: Number(level), text: textContent(body) })
  );
  assert.equal(headings[0].level, 1, 'the page starts at its own h1');
  assert.equal(headings.filter(({ level }) => level === 1).length, 1, 'one h1 per page');
  for (const [index, heading] of headings.entries()) {
    if (index === 0) continue;
    assert.ok(
      heading.level <= headings[index - 1].level + 1,
      `"${heading.text}" skips a heading level`
    );
  }
  // Every question is a heading, so a screen reader can walk the page by question.
  const questions = new Set(triggers.map(({ question }) => question));
  const asHeadings = headings.filter(({ level, text }) => level === 3 && questions.has(text));
  assert.equal(asHeadings.length, triggers.length, 'each question must be its own h3');
  const groups = headings.filter(({ level }) => level === 2);
  assert.ok(groups.length >= 2, 'grouped questions need more than one group');
  for (const group of groups) assert.ok(group.text, 'a group heading must name its topic');
});

test('the chevron comes from the shared sprite and carries no name of its own', async () => {
  const icons = [...faq.matchAll(/<svg\b([^>]*)>\s*<use href="#icon-([^"]+)"><\/use>\s*<\/svg>/g)];
  const accordion = icons.filter(([, attributes]) => attributes.includes('faq-item__icon'));
  assert.equal(accordion.length, triggers.length, 'one chevron per question, from the sprite');
  for (const [, attributes, name] of accordion) {
    assert.equal(name, 'chevron-down', 'the accordion uses the canonical downward chevron');
    assert.match(attributes, /aria-hidden="true"/, 'the artwork is decorative');
    assert.match(attributes, /focusable="false"/, 'the artwork must never take focus');
    assert.match(attributes, /viewBox="0 0 35 20"/, 'the symbol keeps its authored viewBox');
  }
  // Opening turns the one symbol rather than swapping in its mirror, which is what keeps the
  // upward chevron claimed once per document by the shared scroll-to-top control.
  assert.equal((faq.match(/<use href="#icon-chevron-up"><\/use>/g) || []).length, 1);
  assert.match(pagesCss, /\.faq-item__trigger\[aria-expanded='true'\] \.faq-item__icon \{/);
  assert.match(pagesCss, /transform: rotate\(180deg\);/);

  // Nothing may grow a private copy of the artwork the sprite already publishes: no inline
  // geometry, no Unicode arrow standing in for it, and no standalone asset beside it.
  const sprite = await fs.readFile(path.join(ROOT, 'icons.js'), 'utf8');
  const geometry = sprite.match(/<symbol id="icon-chevron-down"[\s\S]*?\bd="([^"]+)"/)[1];
  for (const [file, contents] of [
    [FILE, faq],
    ['js/ui/faq.js', moduleSource],
    ['css/partials/pages.css', pagesCss],
  ]) {
    assert.ok(!contents.includes(geometry), `${file}: duplicates the chevron artwork`);
    assert.doesNotMatch(contents, /[↑↓▲▼⌃⌄]/, `${file}: Unicode arrow`);
  }
  const published = await fs.readdir(path.join(ROOT, 'public/assets/icons'), { recursive: true });
  assert.deepEqual(
    published.filter((entry) => /chevron/i.test(entry)),
    [],
    'the chevron belongs to the sprite, not to a standalone asset'
  );
});

test('the answers keep the project honest about what the demo does and does not do', () => {
  const answers = triggers.map(({ tag }) => {
    const id = attribute(tag, 'aria-controls');
    return textContent(
      faq.match(new RegExp(String.raw`<div\b[^>]*\sid="${id}"[^>]*>([\s\S]*?)</div>`))[1]
    );
  });
  const body = answers.join(' ');
  // The contact form is the project's one real submission; every commerce step is a simulation.
  assert.match(body, /Netlify Forms/, 'the FAQ should say which flow really submits');
  assert.match(body, /symulacj/i, 'the FAQ should name the checkout a simulation');
  assert.match(body, /localStorage/, 'the FAQ should say where the cart actually lives');
  for (const claim of [/gwarantujemy/i, /dostarczamy w ciągu/i, /zwrot pieniędzy/i]) {
    assert.doesNotMatch(body, claim, `the FAQ promises fulfilment the project cannot perform`);
  }
  // Legal detail is linked, never restated: one truth source per document.
  const legal = ['terms.html', 'privacy-policy.html', 'cookies.html'];
  for (const document of legal) {
    assert.match(faq, new RegExp(String.raw`href="${document.replace('.', '\\.')}"`), document);
  }
  for (const answer of answers) {
    assert.ok(answer.length < 900, `an answer this long belongs in a legal document: ${answer}`);
  }
});

// The runtime is exercised against the markup the page actually ships, so a regression in
// either the document or the module fails the same contract.
function mountFaq() {
  const parsed = triggers.map(({ tag, question }) => ({
    id: attribute(tag, 'id'),
    controls: attribute(tag, 'aria-controls'),
    expanded: attribute(tag, 'aria-expanded'),
    question,
  }));
  const answers = new Map();
  const items = parsed.map((item) => {
    const answer = { id: item.controls, hidden: false };
    answers.set(item.controls, answer);
    const trigger = {
      attributes: new Map([
        ['id', item.id],
        ['aria-controls', item.controls],
        ['aria-expanded', item.expanded],
      ]),
      getAttribute: (name) => trigger.attributes.get(name) ?? null,
      setAttribute: (name, value) => trigger.attributes.set(name, String(value)),
      closest: (selector) => (selector === '[data-faq-trigger]' ? trigger : null),
      question: item.question,
      answer,
    };
    return trigger;
  });
  let handler = null;
  let removed = 0;
  const root = {
    querySelectorAll: (selector) => (selector === '[data-faq-trigger]' ? items : []),
    contains: (node) => items.includes(node),
    addEventListener: (type, listener) => {
      if (type === 'click') handler = listener;
    },
    removeEventListener: (type, listener) => {
      if (type === 'click' && listener === handler) removed += 1;
    },
  };
  globalThis.Element = class Element {};
  Object.setPrototypeOf(root, globalThis.Element.prototype);
  for (const item of items) Object.setPrototypeOf(item, globalThis.Element.prototype);
  globalThis.document = {
    querySelector: (selector) => (selector === '[data-faq]' ? root : null),
    getElementById: (id) => answers.get(id) ?? null,
  };
  return {
    items,
    get removed() {
      return removed;
    },
    // Bubbling is what the delegated listener sees: the chevron is a child of the button.
    activate: (item, from = item) => handler({ target: from }),
    state: () =>
      items.map((item) => [item.getAttribute('aria-expanded'), String(item.answer.hidden)]),
  };
}

test('initialization collapses every answer and keeps aria-expanded in step with it', () => {
  const page = mountFaq();
  initFaq();
  assert.deepEqual(
    page.state(),
    page.items.map(() => ['false', 'true']),
    'the module should collapse what the document shipped open'
  );
});

test('activating a question toggles its own answer and leaves the others alone', () => {
  const page = mountFaq();
  initFaq();
  const [first, second] = page.items;

  page.activate(first);
  assert.deepEqual(page.state()[0], ['true', 'false'], 'the activated answer should open');
  assert.deepEqual(
    page.state().slice(1),
    page.items.slice(1).map(() => ['false', 'true']),
    'opening one question must not disturb another'
  );

  // Independent disclosures: a second answer joins the first instead of replacing it.
  page.activate(second);
  assert.deepEqual(page.state()[0], ['true', 'false'], 'the first answer should stay open');
  assert.deepEqual(page.state()[1], ['true', 'false'], 'the second answer should open too');

  page.activate(first);
  assert.deepEqual(page.state()[0], ['false', 'true'], 'activating again should close it');
  assert.deepEqual(page.state()[1], ['true', 'false'], 'and leave the other where it was');
});

test('a click on the decorative chevron reaches the question that owns it', () => {
  const page = mountFaq();
  initFaq();
  const [first] = page.items;
  const icon = { closest: (selector) => (selector === '[data-faq-trigger]' ? first : null) };
  Object.setPrototypeOf(icon, globalThis.Element.prototype);

  page.activate(first, icon);
  assert.deepEqual(page.state()[0], ['true', 'false'], 'the button state should follow the click');
});

test('re-initializing releases the previous binding, and a page without the FAQ is left alone', () => {
  const page = mountFaq();
  initFaq();
  initFaq();
  assert.equal(page.removed, 1, 'the previous delegated listener should be released');

  globalThis.document = { querySelector: () => null, getElementById: () => null };
  assert.doesNotThrow(() => initFaq());
});

test('the module neither moves focus nor scrolls the page on behalf of the visitor', () => {
  for (const forbidden of ['.focus(', 'scrollIntoView', 'scrollTo', 'preventDefault']) {
    assert.ok(!moduleSource.includes(forbidden), `js/ui/faq.js should not call ${forbidden}`);
  }
  // Key handling belongs to the native button, so the module listens for activation only.
  assert.doesNotMatch(moduleSource, /addEventListener\('key/);
  assert.equal((moduleSource.match(/addEventListener\(/g) || []).length, 1);
});
