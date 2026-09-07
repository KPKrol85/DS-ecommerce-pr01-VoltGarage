import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../html.mjs';
import { initOfflineRetry } from '../../js/ui/offline-retry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://volt-garage.invalid';
// The Netlify catch-all and the worker both serve a fallback document at the URL that failed,
// so these documents are rendered at a path that is not their own.
const MISSES = [`${ORIGIN}/pages/typo.html`, `${ORIGIN}/pages/nested/typo.html?ref=mail#sekcja`];
const FALLBACK_DOCUMENTS = ['404.html', 'offline.html'];
const ORDINARY_DOCUMENTS = ['index.html', 'thank-you.html', 'pages/shop.html'];
const SHARED_SHELL =
  '<!-- @include src/partials/header.html --><!-- @include src/partials/footer.html -->';
const REFERENCE = /\b(?:href|src|action|poster)\s*=\s*"([^"]*)"/gi;

const source = (file) => fs.readFile(path.join(ROOT, file), 'utf8');
const render = async (file, markup) => renderHtml(ROOT, file, markup ?? (await source(file)));
const referencesIn = (markup) => [...markup.matchAll(REFERENCE)].map((match) => match[1]);
const isSiteReference = (value) => value !== '' && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value);
const isPageReference = (value) =>
  isSiteReference(value) && value.split(/[?#]/)[0].endsWith('.html');
const routesFrom = (references, documentUrl) =>
  [...new Set(references.map((reference) => new URL(reference, documentUrl).pathname))].sort();

async function hasTarget(route) {
  const relative = decodeURIComponent(route).replace(/^\//, '');
  for (const candidate of [path.join(ROOT, relative), path.join(ROOT, 'public', relative)]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return true;
    } catch {
      // try the next location
    }
  }
  return false;
}

// The retry control reads only the location the browser kept for the failed navigation.
function mountOfflineDocument(documentUrl) {
  const state = { reloads: 0, prevented: 0, assigned: [] };
  let clickHandler = null;
  const control = {
    addEventListener: (type, handler) => {
      if (type === 'click') clickHandler = handler;
    },
  };
  globalThis.document = {
    querySelector: (selector) => (selector === '[data-offline-retry]' ? control : null),
  };
  globalThis.window = {
    location: {
      href: documentUrl,
      assign: (value) => state.assigned.push(value),
      reload: () => (state.reloads += 1),
    },
  };
  return {
    state,
    activate: () => clickHandler({ preventDefault: () => (state.prevented += 1) }),
  };
}

test('every reference a fallback document renders survives a miss below the root', async () => {
  for (const file of FALLBACK_DOCUMENTS) {
    const references = referencesIn(await render(file)).filter(isSiteReference);
    assert.ok(references.length > 10, `${file}: the shared shell should be part of the document`);
    for (const reference of references) {
      const intended = new URL(reference, `${ORIGIN}/`).pathname;
      assert.ok(await hasTarget(intended), `${file}: "${reference}" has no target in the repo`);
      for (const miss of MISSES) {
        assert.equal(
          new URL(reference, miss).pathname,
          intended,
          `${file}: "${reference}" resolves elsewhere when the document is served at ${miss}`
        );
      }
    }
  }
});

test('the shared header and footer reach the same routes from a fallback document', async () => {
  const home = routesFrom(
    referencesIn(await render('index.html', SHARED_SHELL)).filter(isPageReference),
    `${ORIGIN}/index.html`
  );
  assert.ok(home.length >= 12, 'the shared shell should link the whole navigation');
  for (const file of FALLBACK_DOCUMENTS) {
    const shell = referencesIn(await render(file, SHARED_SHELL)).filter(isPageReference);
    assert.ok(
      shell.every((reference) => reference.startsWith('/')),
      `${file}: an inherited shared link is not root-absolute`
    );
    for (const miss of MISSES) assert.deepEqual(routesFrom(shell, miss), home);
  }
});

test('ordinary documents keep their depth-aware relative shared links', async () => {
  const home = routesFrom(
    referencesIn(await render('index.html', SHARED_SHELL)).filter(isPageReference),
    `${ORIGIN}/index.html`
  );
  for (const file of ORDINARY_DOCUMENTS) {
    const shell = referencesIn(await render(file, SHARED_SHELL)).filter(isPageReference);
    assert.ok(
      shell.every((reference) => !reference.startsWith('/')),
      `${file}: shared links must stay document-relative`
    );
    assert.deepEqual(routesFrom(shell, `${ORIGIN}/${file}`), home);
  }
});

test('the recovery links written into the fallback documents are root-absolute', async () => {
  for (const file of FALLBACK_DOCUMENTS) {
    const own = referencesIn(await source(file)).filter(isPageReference);
    assert.ok(own.length > 0, `${file}: expected recovery links of its own`);
    assert.ok(
      own.every((reference) => reference.startsWith('/')),
      `${file}: ${own.filter((reference) => !reference.startsWith('/')).join(', ')}`
    );
  }
});

test('the offline retry control targets the failed navigation, not the fallback document', async () => {
  const markup = await render('offline.html');
  const control = markup.match(/<a\b[^>]*\bdata-offline-retry\b[^>]*>/)?.[0];
  assert.ok(control, 'offline.html should expose a primary retry control');
  const href = control.match(/\bhref\s*=\s*"([^"]*)"/)?.[1];
  assert.equal(typeof href, 'string', 'the retry control should work without scripting');
  assert.ok(
    !/\bhref\s*=\s*"[^"]*offline\.html"/.test(markup),
    'no control on the offline document may link to the fallback document itself'
  );
  for (const miss of MISSES) {
    const [failedNavigation] = miss.split('#');
    assert.equal(new URL(href, miss).href, failedNavigation);
  }
});

test('activating the offline retry control re-requests the current location', () => {
  for (const miss of MISSES) {
    const page = mountOfflineDocument(miss);
    initOfflineRetry();
    page.activate();
    assert.equal(page.state.reloads, 1, 'the failed navigation should be re-requested');
    assert.equal(page.state.prevented, 1, 'the link navigation should give way to the reload');
    assert.deepEqual(page.state.assigned, [], 'no other location should be navigated to');
    assert.equal(globalThis.window.location.href, miss, 'the browser URL should be unchanged');
  }
});

test('a document without a retry control is left alone', () => {
  globalThis.document = { querySelector: () => null };
  assert.doesNotThrow(() => initOfflineRetry());
});

test('fragment, mail, phone and external links keep their meaning on the fallback documents', async () => {
  for (const file of FALLBACK_DOCUMENTS) {
    const references = referencesIn(await render(file));
    for (const expected of [
      '#main',
      'mailto:kontakt@kp-code.pl',
      'tel:+48533537091',
      'https://kp-code.pl/',
    ]) {
      assert.ok(references.includes(expected), `${file}: "${expected}" was rewritten or lost`);
    }
  }
});
