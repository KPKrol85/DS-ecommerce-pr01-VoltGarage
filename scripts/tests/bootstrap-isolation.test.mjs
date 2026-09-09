import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { emit, events, on } from '../../js/core/events.js';

const mainSource = await fs.readFile(new URL('../../js/main.js', import.meta.url), 'utf8');
// Execute the production bootstrap and entry scheduling with initializer doubles.
// The event bus is real; Vite's production flag is substituted for the VM runtime.
const bootstrap = mainSource
  .slice(mainSource.indexOf('const runInitializer ='))
  .replace('import.meta.env.PROD', 'production');
const order = [
  'initGlobalErrorHandling',
  'initAccessibility',
  'initHeader',
  'initTheme',
  'initReveal',
  'initCart',
  'initFeaturedProducts',
  'initFilters',
  'initNewArrivalsProducts',
  'initRelatedProducts',
  'initSaleProducts',
  'initProductDetails',
  'initCartPage',
  'initCheckoutSummary',
  'initForms',
  'initOfflineRetry',
  'injectBreadcrumbJsonLd',
  'initAddToCartButtons',
  'initProjectModal',
  'register',
  'initPwaPrompts',
  'initCopyrightYear',
];

function mountApp(
  t,
  { overrides = {}, selectors = true, production = true, loading = false } = {}
) {
  const calls = [];
  const reports = [];
  const logs = [];
  const cleanups = [on(events.app.error, ({ source, error }) => reports.push({ source, error }))];
  t.after(() => cleanups.forEach((cleanup) => cleanup()));
  const initializers = Object.fromEntries(
    order.map((name) => [
      name,
      (...args) => {
        calls.push(name);
        return overrides[name]?.(...args);
      },
    ])
  );
  const document = Object.assign(new EventTarget(), {
    readyState: loading ? 'loading' : 'complete',
    body: selectors ? {} : null,
    querySelector: () => (selectors ? {} : null),
  });
  const start = () =>
    vm.runInNewContext(bootstrap, {
      ...initializers,
      document,
      production,
      navigator: {
        serviceWorker: {
          register: (url, options) => {
            assert.equal(url, '/sw.js');
            assert.equal(options.updateViaCache, 'none');
            return initializers.register(url, options) ?? Promise.resolve({});
          },
        },
      },
      emit,
      events,
      on: (name, handler) => {
        const cleanup = on(name, handler);
        cleanups.push(cleanup);
        return cleanup;
      },
      console: {
        error: (...args) => {
          logs.push(args);
        },
      },
    });
  return { start, calls, reports, logs, document };
}

test('bootstrap preserves initializer order and successful initialization reports no errors', async (t) => {
  const app = mountApp(t);
  app.start();
  assert.deepEqual(app.calls, order);
  await Promise.resolve();
  assert.deepEqual(app.reports, [{ source: 'init:ready', error: null }]);
  assert.deepEqual(app.logs, []);
});

for (const name of order.filter((name) => name !== 'register')) {
  test(`${name} throwing is reported and every later initializer still runs`, (t) => {
    const error = new Error(`${name} failed`);
    const app = mountApp(t, {
      overrides: {
        [name]: () => {
          throw error;
        },
      },
    });
    assert.doesNotThrow(app.start);
    assert.deepEqual(app.calls, order);
    assert.deepEqual(
      app.reports.filter((report) => report.error),
      [{ source: name, error }]
    );
    assert.deepEqual(app.logs, [['[VOLT][app]', name, error]]);
  });
}

test('pending initializer does not delay later modules and its rejection uses the app error bus', async (t) => {
  let reject;
  const pending = new Promise((resolve, rejectPromise) => (reject = rejectPromise));
  const app = mountApp(t, { overrides: { initFeaturedProducts: () => pending } });
  app.start();
  assert.deepEqual(app.calls, order, 'later initializers run before the promise settles');
  assert.deepEqual(app.logs, []);
  const error = new Error('async initialization failed');
  reject(error);
  // Allow the VM Promise to assimilate the returned promise and report its rejection.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    app.reports.filter((report) => report.error),
    [{ source: 'initFeaturedProducts', error }]
  );
  assert.deepEqual(app.logs, [['[VOLT][app]', 'initFeaturedProducts', error]]);
});

test('synchronous service worker registration failure leaves the copyright initializer running', (t) => {
  const error = new Error('registration threw');
  const app = mountApp(t, {
    overrides: {
      register: () => {
        throw error;
      },
    },
  });
  assert.doesNotThrow(app.start);
  assert.deepEqual(
    app.calls,
    order.filter((name) => name !== 'initPwaPrompts')
  );
  assert.deepEqual(app.logs, [['[VOLT][app]', 'initPwaPrompts', error]]);
});

test('service worker rejection keeps existing logging and its handled registration promise', async (t) => {
  const error = new Error('registration rejected');
  let registration;
  const app = mountApp(t, {
    overrides: {
      register: () => Promise.reject(error),
      initPwaPrompts: (promise) => (registration = promise),
    },
  });
  app.start();
  assert.deepEqual(app.calls, order);
  assert.equal(await registration, undefined);
  assert.deepEqual(app.logs, [['[VOLT][sw]', error]]);
  assert.deepEqual(app.reports, [{ source: 'init:ready', error: null }]);
});

test('missing selectors preserve gating while delegation and the project modal always initialize', (t) => {
  const app = mountApp(t, { selectors: false, production: false });
  app.start();
  assert.deepEqual(app.calls, [
    'initGlobalErrorHandling',
    'initAddToCartButtons',
    'initProjectModal',
  ]);
});

test('a loading document defers bootstrap until DOMContentLoaded and initializes only once', (t) => {
  const app = mountApp(t, { loading: true });
  app.start();
  assert.deepEqual(app.calls, []);
  app.document.dispatchEvent(new Event('DOMContentLoaded'));
  assert.deepEqual(app.calls, order);
  app.document.dispatchEvent(new Event('DOMContentLoaded'));
  assert.deepEqual(app.calls, order);
});
