import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STORAGE_KEY = 'vg_project_terms_accepted';
// The disclosure ships inside the shared footer, so it renders through the same include pipeline
// Vite uses. index.html fixes the prefixes its legal destinations resolve against.
const SHELL = '<!-- @include src/partials/footer.html -->';

const modalSource = await fs.readFile(
  new URL('../../js/ui/project-modal.js', import.meta.url),
  'utf8'
);
const rendered = await renderHtml(ROOT, 'index.html', SHELL);
const disclosure = rendered.slice(rendered.indexOf('<div class="project-modal"'));

const SELECTOR = /^\[([\w-]+)(?:="([^"]*)")?\]$/;

// Only the DOM surface the disclosure actually touches: attribute selectors, the hidden attribute,
// class toggling, containment and focus. Every mutation is recorded in frame order so the test can
// assert that focus is armed after the panel is visible rather than in the same frame.
function createDom(log) {
  let activeElement = null;

  const matches = (el, selector) => {
    const parsed = SELECTOR.exec(selector);
    if (!parsed) return false;
    const [, name, value] = parsed;
    if (!el.attributes.has(name)) return false;
    return value === undefined || el.attributes.get(name) === value;
  };

  const element = (name, attributes = {}) => {
    const attrs = new Map(Object.entries(attributes));
    const listeners = new Map();
    const el = {
      name,
      attributes: attrs,
      children: [],
      hidden: false,
      classes: new Set(),
      classList: {
        add: (value) => {
          el.classes.add(value);
          log.push(`${name}:+${value}`);
        },
        remove: (value) => {
          el.classes.delete(value);
          log.push(`${name}:-${value}`);
        },
        contains: (value) => el.classes.has(value),
      },
      append(...children) {
        this.children.push(...children);
      },
      querySelector(selector) {
        for (const child of this.children) {
          if (matches(child, selector)) return child;
          const found = child.querySelector(selector);
          if (found) return found;
        }
        return null;
      },
      querySelectorAll() {
        return [];
      },
      contains(node) {
        if (!node) return false;
        if (node === this) return true;
        return this.children.some((child) => child.contains(node));
      },
      hasAttribute: (attribute) => attrs.has(attribute),
      closest: () => null,
      focus() {
        activeElement = el;
        log.push(`focus:${name}`);
      },
      blur() {
        if (activeElement === el) activeElement = null;
        log.push(`blur:${name}`);
      },
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
      dispatchEvent(type) {
        listeners.get(type)?.();
      },
    };
    return el;
  };

  const body = element('body');
  const modal = element('modal', { 'data-project-modal': '' });
  const accept = element('accept', { 'data-project-accept': '' });
  modal.append(accept);
  body.append(modal);

  return {
    body,
    modal,
    accept,
    document: {
      body,
      querySelector: (selector) => (matches(body, selector) ? body : body.querySelector(selector)),
      addEventListener() {},
      removeEventListener() {},
      get activeElement() {
        return activeElement;
      },
    },
  };
}

// The real trap is covered by its own module; here only its lifecycle needs to be observable.
function createTrapDouble(log) {
  return {
    factory: () => ({
      activate: () => log.push('trap:activate'),
      deactivate: () => log.push('trap:deactivate'),
    }),
  };
}

function mount({ stored = null, writable = true } = {}) {
  const log = [];
  const dom = createDom(log);
  const trap = createTrapDouble(log);
  const store = new Map(stored === null ? [] : [[STORAGE_KEY, stored]]);
  const frames = [];

  // Mirrors safeStorage, including the silent no-op it degrades to when the area is blocked.
  const safeStorage = {
    get: (key) => (store.has(key) ? store.get(key) : null),
    set: (key, value) => {
      if (writable) store.set(key, value);
      log.push(`store:${key}=${value}`);
    },
    remove: (key) => store.delete(key),
  };

  vm.runInNewContext(
    `${modalSource.replace(/^import .*;\r?\n/gm, '').replace('export const', 'const')}
    initProjectModal();`,
    {
      document: dom.document,
      safeStorage,
      createFocusTrap: trap.factory,
      requestAnimationFrame: (callback) => frames.push(callback),
    }
  );

  return {
    ...dom,
    log,
    store,
    // Drain the queued frames one at a time, the way the browser delivers them, marking each
    // boundary so assertions can tell which frame a call belongs to.
    runFrames() {
      let guard = 0;
      while (frames.length && guard < 10) {
        guard += 1;
        log.push(`frame:${guard}`);
        frames.shift()();
      }
      return this;
    },
  };
}

test('the project disclosure renders as a labelled, described modal dialog', () => {
  assert.match(disclosure, /<div class="project-modal" data-project-modal hidden>/);
  assert.match(disclosure, /role="dialog"/);
  assert.match(disclosure, /aria-modal="true"/);
  assert.match(disclosure, /aria-labelledby="project-modal-title"/);
  assert.match(disclosure, /aria-describedby="project-modal-description"/);
  assert.match(disclosure, /<h2 id="project-modal-title">Informacja o projekcie<\/h2>/);
  assert.match(disclosure, /id="project-modal-description"/);
});

test('the disclosure states the demonstration contract without new claims', () => {
  assert.match(disclosure, /projekt demonstracyjny/);
  assert.match(disclosure, /KP_Code Digital Studio/);
  // The storefront takes no orders and processes no payments; the copy must keep saying so.
  assert.match(disclosure, /nie realizuje\s+rzeczywistych zamówień ani płatności/);
  // The panel informs; it never claims the visitor has accepted anything by reading it.
  assert.doesNotMatch(disclosure, /akceptacj|Akceptuję|zgadzam|wyrażam zgodę/i);
});

test('the body copy points at the legal row instead of linking a document inline', () => {
  const note = disclosure.match(/<p class="project-modal__note">([\s\S]*?)<\/p>/);
  assert.ok(note, 'the disclosure must keep its closing note');
  assert.equal(
    note[1].replace(/\s+/g, ' ').trim(),
    'Szczegóły działania i zasady korzystania znajdziesz poniżej.'
  );
  // Every legal destination belongs to the footer row now: no anchor may sit in the note, and the
  // description paragraph links only the studio credit.
  assert.doesNotMatch(note[1], /<a\b/);
  const description = disclosure.match(/<p id="project-modal-description">([\s\S]*?)<\/p>/)[1];
  assert.deepEqual(
    [...description.matchAll(/href="([^"]*)"/g)].map((m) => m[1]),
    ['https://kp-code.pl/']
  );
});

test('the studio credit stays a link without reading as a rule through the sentence', () => {
  const studio = disclosure.match(/<a\b[^>]*class="project-modal__studio"[\s\S]*?<\/a\s*>/);
  assert.ok(studio, 'the studio credit must carry its own hook');
  assert.match(studio[0], /href="https:\/\/kp-code\.pl\/"/);
  assert.match(studio[0], /rel="noopener noreferrer"/);
  assert.match(studio[0], /KP_Code Digital Studio/);
});

test('the primary control invites the visitor in rather than collecting acceptance', () => {
  const button = disclosure.match(/<button[^>]*data-project-accept[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(button, 'the disclosure must expose an acknowledgement control');
  // `.btn` uppercases every label, so the panel renders PRZEJDŹ DO SERWISU while the accessible
  // name stays sentence case, the way every other button in the storefront is authored.
  assert.equal(button[1].replace(/\s+/g, ' ').trim(), 'Przejdź do serwisu');
  assert.match(button[0], /class="btn btn-accent project-modal__cta"/);
});

test('the legal row exposes all three destinations in order', () => {
  const row = disclosure.match(/<div class="project-modal__links">([\s\S]*?)<\/div>/);
  assert.ok(row, 'the disclosure must keep its legal row');
  const links = [...row[1].matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => [
    match[2].replace(/\s+/g, ' ').trim(),
    match[1],
  ]);
  assert.deepEqual(links, [
    ['Polityka prywatności', 'pages/privacy-policy.html'],
    ['Cookies', 'pages/cookies.html'],
    ['Regulamin', 'pages/terms.html'],
  ]);
  // The bullets between them are decoration, not navigation.
  const separators = [...row[1].matchAll(/<span class="project-modal__separator"([^>]*)>/g)];
  assert.equal(separators.length, 2);
  for (const [, attributes] of separators) assert.match(attributes, /aria-hidden="true"/);
});

test('the brand mark stays decorative', () => {
  const mark = disclosure.match(/<img[\s\S]*?class="project-modal__mark"[\s\S]*?\/>/);
  assert.ok(mark, 'the disclosure must carry the shared storefront mark');
  assert.match(mark[0], /alt=""/);
  assert.match(mark[0], /aria-hidden="true"/);
});

test('a first visit opens the disclosure and locks the page behind it', () => {
  const app = mount().runFrames();
  assert.equal(app.modal.hidden, false);
  assert.ok(app.body.classes.has('project-modal-open'));
  assert.ok(app.modal.classes.has('is-visible'));
});

test('focus reaches the acknowledgement control only once the panel is visible', () => {
  const app = mount().runFrames();
  const shown = app.log.indexOf('modal:+is-visible');
  const armed = app.log.indexOf('trap:activate');
  const focused = app.log.indexOf('focus:accept');
  assert.ok(shown >= 0, 'the panel must be revealed');
  assert.ok(armed > shown, 'the trap must arm after the panel is revealed');
  assert.ok(focused > armed, 'initial focus must land on the acknowledgement control');
  assert.equal(app.document.activeElement, app.accept);
  // The entrance transition still reports the panel as hidden in the frame the class lands in, so
  // the focus call has to wait for a later frame or the browser silently drops it.
  const frameOf = (index) =>
    app.log.slice(0, index).filter((entry) => entry.startsWith('frame:')).length;
  assert.ok(
    frameOf(focused) > frameOf(shown),
    'focus must not be requested in the frame that reveals the panel'
  );
});

test('acknowledging persists the flag, closes the disclosure and releases the trap', () => {
  const app = mount().runFrames();
  app.accept.dispatchEvent('click');
  assert.equal(app.store.get(STORAGE_KEY), '1');
  assert.equal(app.modal.hidden, true);
  assert.equal(app.modal.classes.has('is-visible'), false);
  assert.equal(app.body.classes.has('project-modal-open'), false);
  assert.ok(app.log.includes('trap:deactivate'));
});

test('an acknowledged visitor never sees the disclosure again', () => {
  const app = mount({ stored: '1' }).runFrames();
  assert.equal(app.modal.hidden, true);
  assert.equal(app.body.classes.has('project-modal-open'), false);
  assert.deepEqual(app.log, []);
});

test('a blocked storage area still shows and closes the disclosure', () => {
  const app = mount({ writable: false }).runFrames();
  assert.equal(app.modal.hidden, false);
  app.accept.dispatchEvent('click');
  assert.equal(app.modal.hidden, true);
  assert.equal(app.store.has(STORAGE_KEY), false);
});
