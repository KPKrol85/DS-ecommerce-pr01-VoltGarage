import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverHtml, renderHtml } from '../html.mjs';
import { initTheme } from '../../js/ui/theme.js';
import { safeStorage } from '../../js/services/storage.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const documents = discoverHtml(ROOT);
// The control is named by what it does. The theme it currently applies is state, not a name,
// so it belongs in aria-pressed and never in the accessible name.
const ACCESSIBLE_NAME = 'Przełącz motyw';
const STATE_NAMES = ['auto', 'light', 'dark', 'jasny', 'ciemny'];
const TOGGLE = /<button\b[^>]*\bdata-theme-toggle\b[^>]*>/i;

function attributesOf(tag) {
  const attributes = new Map();
  const body = tag.replace(/^<button/i, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(/([a-zA-Z][\w:.-]*)(?:\s*=\s*"([^"]*)")?/g)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? '');
  }
  return attributes;
}

// Read the toggle out of the shared shell exactly as Vite renders it into the document.
async function renderedToggle(file) {
  const source = await fs.readFile(path.join(ROOT, file), 'utf8');
  const markup = await renderHtml(ROOT, file, source);
  const tag = markup.match(TOGGLE)?.[0];
  assert.ok(tag, `${file}: the shared header must render the theme toggle`);
  return attributesOf(tag);
}

const SHARED_MARKUP = await renderedToggle('index.html');

// The runtime is exercised against the attributes the shared partial actually ships, so a
// regression in either the markup or reflectPreference fails the same contract.
function mountTheme(t, { stored = null, systemDark = false } = {}) {
  const attributes = new Map(SHARED_MARKUP);
  const root = new Map();
  const written = [];
  const persisted = [];
  let click = null;
  let systemChange = null;
  const toggle = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => {
      written.push(name);
      attributes.set(name, String(value));
    },
    addEventListener: (type, handler) => {
      if (type === 'click') click = handler;
    },
  };
  const media = {
    matches: systemDark,
    addEventListener: (type, handler) => {
      if (type === 'change') systemChange = handler;
    },
  };
  globalThis.document = {
    documentElement: {
      getAttribute: (name) => root.get(name) ?? null,
      setAttribute: (name, value) => root.set(name, String(value)),
    },
    querySelector: (selector) => (selector === '[data-theme-toggle]' ? toggle : null),
  };
  globalThis.window = { matchMedia: () => media };
  t.mock.method(safeStorage, 'get', () => stored);
  t.mock.method(safeStorage, 'set', (key, value) => persisted.push([key, value]));
  initTheme();
  return {
    written,
    persisted,
    get name() {
      return toggle.getAttribute('aria-label');
    },
    get pressed() {
      return toggle.getAttribute('aria-pressed');
    },
    get live() {
      return toggle.getAttribute('aria-live');
    },
    get theme() {
      return root.get('data-theme') ?? null;
    },
    activate: () => click(),
    systemPrefers: (dark) => {
      media.matches = dark;
      systemChange({ matches: dark });
    },
  };
}

test('the theme scan covers all 15 Vite HTML entries', () => {
  assert.equal(documents.length, 15);
  for (const file of ['index.html', 'pages/shop.html', '404.html', 'offline.html']) {
    assert.ok(documents.includes(file), `${file} should be a rendered document`);
  }
});

for (const file of documents) {
  test(`${file}: the theme toggle is named by what it does`, async () => {
    const toggle = await renderedToggle(file);
    assert.equal(toggle.get('aria-label'), ACCESSIBLE_NAME, `${file}: unexpected accessible name`);
    assert.ok(
      !STATE_NAMES.includes((toggle.get('aria-label') ?? '').toLowerCase()),
      `${file}: the accessible name states the theme instead of the control's purpose`
    );
    // aria-pressed carries the state, so a live region on the control itself only repeats it.
    assert.equal(toggle.has('aria-live'), false, `${file}: the toggle still carries aria-live`);
    assert.equal(toggle.get('aria-pressed'), 'false', `${file}: missing initial pressed state`);
    assert.equal(toggle.get('type'), 'button', `${file}: the control must stay a plain button`);
    assert.ok(toggle.has('data-theme-toggle'), `${file}: the runtime hook was lost`);
    assert.equal(toggle.get('id'), 'theme-toggle', `${file}: the toggle id changed`);
    const classes = (toggle.get('class') ?? '').split(/\s+/);
    assert.ok(classes.includes('theme-toggle'), `${file}: the toggle class list changed`);
  });
}

test('an unset preference under a light system starts unpressed', (t) => {
  const page = mountTheme(t);
  assert.equal(page.theme, 'light');
  assert.equal(page.pressed, 'false');
  assert.equal(page.name, ACCESSIBLE_NAME);
  assert.deepEqual(page.persisted, [], 'resolving a theme must not write a preference');
});

test('an unset preference under a dark system starts pressed', (t) => {
  const page = mountTheme(t, { systemDark: true });
  assert.equal(page.theme, 'dark');
  assert.equal(page.pressed, 'true');
  assert.equal(page.name, ACCESSIBLE_NAME);
});

test('a stored preference is restored without renaming the control', (t) => {
  for (const [stored, pressed] of [
    ['light', 'false'],
    ['dark', 'true'],
  ]) {
    const page = mountTheme(t, { stored, systemDark: stored === 'light' });
    assert.equal(page.theme, stored, `stored "${stored}" should win over the system theme`);
    assert.equal(page.pressed, pressed);
    assert.equal(page.name, ACCESSIBLE_NAME);
  }
});

test('toggling in both directions moves aria-pressed and leaves the name alone', (t) => {
  const page = mountTheme(t);
  const name = page.name;
  assert.equal(page.pressed, 'false');
  page.activate();
  assert.equal(page.theme, 'dark');
  assert.equal(page.pressed, 'true', 'light -> dark should press the toggle');
  assert.equal(page.name, name, 'the accessible name changed on the way to dark');
  page.activate();
  assert.equal(page.theme, 'light');
  assert.equal(page.pressed, 'false', 'dark -> light should release the toggle');
  assert.equal(page.name, name, 'the accessible name changed on the way back to light');
  assert.equal(page.live, null, 'the runtime must not reintroduce a live region');
  assert.ok(!page.written.includes('aria-label'), 'the runtime must never rewrite the name');
  assert.deepEqual(
    page.persisted,
    [
      ['vg_theme', 'dark'],
      ['vg_theme', 'light'],
    ],
    'each toggle should persist the chosen theme under the existing key'
  );
});

test('a system change reaches the pressed state only while no preference is stored', (t) => {
  const page = mountTheme(t);
  assert.equal(page.pressed, 'false');
  page.systemPrefers(true);
  assert.equal(page.theme, 'dark');
  assert.equal(page.pressed, 'true');
  assert.equal(page.name, ACCESSIBLE_NAME);
  page.activate();
  page.systemPrefers(false);
  assert.equal(page.theme, 'light', 'a chosen theme outranks the system theme');
  assert.equal(page.pressed, 'false');
  assert.equal(page.name, ACCESSIBLE_NAME);
  assert.ok(!page.written.includes('aria-label'), 'a system change must not rename the control');

  const chosen = mountTheme(t, { stored: 'dark' });
  chosen.systemPrefers(false);
  assert.equal(chosen.theme, 'dark', 'a stored preference outranks the system theme');
  assert.equal(chosen.pressed, 'true');
  assert.equal(chosen.name, ACCESSIBLE_NAME);
});
