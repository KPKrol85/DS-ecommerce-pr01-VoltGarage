import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const workerSource = await fs.readFile(new URL('../../src/sw.js', import.meta.url), 'utf8');
const promptSource = await fs.readFile(
  new URL('../../js/ui/pwa-prompts.js', import.meta.url),
  'utf8'
);

function worker() {
  return Object.assign(new EventTarget(), {
    state: 'installing',
    messages: [],
    postMessage(message) {
      this.messages.push(message);
    },
  });
}

// Only the DOM operations used by the real toast renderer are needed here.
function element() {
  const attributes = new Map();
  const el = Object.assign(new EventTarget(), {
    children: [],
    hidden: false,
    setAttribute: (name, value) => attributes.set(name, value),
    append(...children) {
      this.children.push(...children);
    },
    appendChild(child) {
      this.append(child);
    },
    querySelector(selector) {
      if (attributes.has(selector.slice(1, -1))) return this;
      for (const child of this.children) {
        const match = child.querySelector(selector);
        if (match) return match;
      }
      return null;
    },
  });
  Object.defineProperty(el, 'innerHTML', {
    set(value) {
      assert.equal(value, '');
      this.children = [];
    },
  });
  return el;
}

function mountPrompts({ controller = null, waiting = null, installing = null } = {}) {
  const body = element();
  const serviceWorker = Object.assign(new EventTarget(), { controller });
  const registration = Object.assign(new EventTarget(), { waiting, installing });
  let reloads = 0;
  let resolveRegistration;
  const registrationPromise = new Promise((resolve) => (resolveRegistration = resolve));
  const window = Object.assign(new EventTarget(), {
    location: { reload: () => reloads++ },
  });
  // Strip only module syntax; execute the complete production prompt implementation.
  vm.runInNewContext(
    `${promptSource.replace(/^import .*;\r?\n/m, '').replace('export const', 'const')}
    initPwaPrompts(registrationPromise);`,
    {
      window,
      navigator: { serviceWorker, onLine: true },
      document: {
        body,
        createElement: element,
        querySelector: (selector) => body.querySelector(selector),
      },
      safeStorage: { get: () => null, set() {} },
      registrationPromise,
    }
  );
  return {
    registration,
    async ready() {
      resolveRegistration(registration);
      await registrationPromise;
    },
    discover(next) {
      registration.installing = next;
      registration.dispatchEvent(new Event('updatefound'));
    },
    installed(next) {
      registration.installing = null;
      registration.waiting = next;
      next.state = 'installed';
      next.dispatchEvent(new Event('statechange'));
    },
    control(next) {
      serviceWorker.controller = next;
      serviceWorker.dispatchEvent(new Event('controllerchange'));
    },
    get toast() {
      return body.querySelector('[data-toast]');
    },
    clickUpdate() {
      const button = body.querySelector('[data-toast-actions]')?.children[0];
      assert.equal(button?.textContent, 'Odśwież');
      button.dispatchEvent(new Event('click'));
    },
    get reloads() {
      return reloads;
    },
  };
}

test('install awaits successful precaching without skipWaiting; only the message requests it', async () => {
  const handlers = new Map();
  let skipped = 0;
  let finishPrecache;
  const precaching = new Promise((resolve) => (finishPrecache = resolve));
  let startPrecache;
  const started = new Promise((resolve) => (startPrecache = resolve));
  const requests = [];
  vm.runInNewContext(workerSource.replace('/* __VOLT_PRECACHE__ */', '"/", "/offline.html"'), {
    self: {
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: () => skipped++,
    },
    caches: {
      async open(name) {
        assert.match(name, /^volt-garage-.*-static$/);
        return {
          addAll(entries) {
            requests.push(...entries);
            startPrecache();
            return precaching;
          },
        };
      },
    },
    Request: class {
      constructor(url, options) {
        this.url = url;
        this.cache = options.cache;
      }
    },
  });
  let installPromise;
  handlers.get('install')({ waitUntil: (promise) => (installPromise = promise) });
  let finished = false;
  installPromise.then(() => (finished = true));
  await started;
  assert.equal(finished, false);
  assert.deepEqual(
    requests.map(({ url, cache }) => [url, cache]),
    [
      ['/', 'reload'],
      ['/offline.html', 'reload'],
    ]
  );
  finishPrecache();
  await installPromise;
  assert.equal(finished, true);
  assert.equal(skipped, 0);
  handlers.get('message')({ data: 'unrelated' });
  assert.equal(skipped, 0);
  handlers.get('message')({ data: 'SKIP_WAITING' });
  assert.equal(skipped, 1);
});

test('first installation and first controller acquisition show no update and never reload', async () => {
  const app = mountPrompts();
  await app.ready();
  const first = worker();
  app.discover(first);
  app.installed(first);
  assert.equal(app.toast, null);
  app.registration.waiting = null;
  app.control(first);
  app.control(first);
  assert.equal(app.reloads, 0);
  assert.deepEqual(first.messages, []);
});

test('a first controller acquired before registration resolves still permits a later approved update', async () => {
  const app = mountPrompts();
  app.control(worker());
  await app.ready();
  const next = worker();
  app.discover(next);
  app.installed(next);
  app.clickUpdate();
  app.control(next);
  assert.equal(app.reloads, 1);
});

test('update discovery and installation wait for the action, then reload only once', async () => {
  const app = mountPrompts({ controller: worker() });
  await app.ready();
  const next = worker();
  app.discover(next);
  assert.equal(app.toast, null);
  assert.equal(app.reloads, 0);
  app.installed(next);
  assert.equal(app.toast.hidden, false);
  assert.equal(
    app.toast.querySelector('[data-toast-message]').textContent,
    'Dostępna jest nowa wersja aplikacji.'
  );
  assert.deepEqual(next.messages, []);
  assert.equal(app.reloads, 0);
  app.clickUpdate();
  app.clickUpdate();
  assert.deepEqual(next.messages, ['SKIP_WAITING']);
  assert.equal(app.reloads, 0, 'the action waits for controller replacement');
  app.control(next);
  app.control(next);
  assert.equal(app.reloads, 1);
});

test('a waiting update at initialization targets that worker only after the action', async () => {
  const next = worker();
  next.state = 'installed';
  const app = mountPrompts({ controller: worker(), waiting: next });
  await app.ready();
  assert.equal(app.toast.hidden, false);
  assert.deepEqual(next.messages, []);
  assert.equal(app.reloads, 0);
  app.clickUpdate();
  assert.deepEqual(next.messages, ['SKIP_WAITING']);
  app.control(next);
  assert.equal(app.reloads, 1);
});

test('an update already installing at initialization is observed', async () => {
  const next = worker();
  const app = mountPrompts({ controller: worker(), installing: next });
  await app.ready();
  app.installed(next);
  assert.equal(app.toast?.hidden, false);
  assert.deepEqual(next.messages, []);
  assert.equal(app.reloads, 0);
});

test('controller replacement without this page approving the worker never reloads', async () => {
  const app = mountPrompts({ controller: worker() });
  await app.ready();
  const next = worker();
  app.discover(next);
  app.installed(next);
  // Another tab may approve a shared registration; this page did not consent to reload.
  app.control(next);
  app.control(next);
  assert.equal(app.reloads, 0);
});

test('a newer waiting worker replaces the toast action before the user approves', async () => {
  const previous = worker();
  const app = mountPrompts({ controller: worker(), waiting: previous });
  await app.ready();
  const latest = worker();
  app.discover(latest);
  app.installed(latest);
  app.clickUpdate();
  assert.deepEqual(previous.messages, []);
  assert.deepEqual(latest.messages, ['SKIP_WAITING']);
  app.control(latest);
  assert.equal(app.reloads, 1);
});

test('stale actions and unrelated controller events do not activate or reload', async () => {
  const next = worker();
  const app = mountPrompts({ controller: worker(), waiting: next });
  await app.ready();
  app.registration.waiting = null;
  app.clickUpdate();
  assert.deepEqual(next.messages, []);
  app.registration.waiting = next;
  app.clickUpdate();
  app.control(null);
  app.control(worker());
  assert.equal(app.reloads, 0);
  app.control(next);
  app.control(next);
  assert.equal(app.reloads, 1);
});
