import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { safeSessionStorage } from '../../js/services/storage.js';

const promptSource = await fs.readFile(
  new URL('../../js/ui/pwa-prompts.js', import.meta.url),
  'utf8'
);

const AUTO_COLLAPSE_DELAY = 30000;
const SESSION_KEY = 'vg_install_cta_session_dismissed';
const PERSISTENT_KEY = 'vg_install_cta_dismissed';

const SELECTOR = /^\[([\w-]+)(?:="([^"]*)")?\]$/;

// Only the DOM surface the install UI actually touches: attribute selectors, the hidden
// attribute, containment and focus.
function createDom() {
  let activeElement = null;

  const matches = (el, selector) => {
    const parsed = SELECTOR.exec(selector);
    if (!parsed) return false;
    const [, name, value] = parsed;
    if (!el.attributes.has(name)) return false;
    return value === undefined || el.attributes.get(name) === value;
  };

  const element = () => {
    const attributes = new Map();
    const el = Object.assign(new EventTarget(), {
      attributes,
      children: [],
      hidden: false,
      textContent: '',
      className: '',
      setAttribute: (name, value) => attributes.set(name, String(value)),
      getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
      append(...children) {
        this.children.push(...children);
      },
      appendChild(child) {
        this.append(child);
      },
      querySelector(selector) {
        for (const child of this.children) {
          if (matches(child, selector)) return child;
          const found = child.querySelector(selector);
          if (found) return found;
        }
        return null;
      },
      contains(node) {
        if (!node) return false;
        if (node === this) return true;
        return this.children.some((child) => child.contains(node));
      },
      focus() {
        activeElement = el;
      },
    });
    Object.defineProperty(el, 'innerHTML', {
      set() {
        this.children = [];
      },
    });
    return el;
  };

  const body = element();
  return {
    body,
    document: {
      body,
      createElement: element,
      querySelector: (selector) => body.querySelector(selector),
      get activeElement() {
        return activeElement;
      },
    },
    focusOn: (el) => {
      activeElement = el;
    },
  };
}

function createTimers() {
  const pending = new Map();
  let nextId = 1;
  let created = 0;
  return {
    api: {
      setTimeout: (callback, delay) => {
        created += 1;
        const id = nextId++;
        pending.set(id, { callback, delay });
        return id;
      },
      clearTimeout: (id) => pending.delete(id),
    },
    get created() {
      return created;
    },
    get pending() {
      return [...pending.values()].map(({ delay }) => delay);
    },
    run() {
      assert.equal(pending.size, 1, 'exactly one auto-collapse timer should be armed');
      const [[id, { callback, delay }]] = [...pending.entries()];
      assert.equal(delay, AUTO_COLLAPSE_DELAY);
      pending.delete(id);
      callback();
    },
  };
}

function installEvent() {
  let settle;
  return Object.assign(new Event('beforeinstallprompt'), {
    prevented: 0,
    prompts: 0,
    preventDefault() {
      this.prevented += 1;
    },
    prompt() {
      this.prompts += 1;
    },
    userChoice: new Promise((resolve) => (settle = resolve)),
    choose(outcome) {
      settle({ outcome });
      // Let the awaiting install handler observe the resolution before assertions run.
      return Promise.resolve().then(() => Promise.resolve());
    },
  });
}

function mount({ local = {}, session = {}, sessionWritable = true, online = true } = {}) {
  const dom = createDom();
  const timers = createTimers();
  const window = Object.assign(new EventTarget(), { location: { reload() {} } });
  const stores = {
    local: new Map(Object.entries(local)),
    session: new Map(Object.entries(session)),
  };
  // Mirrors safeStorage/safeSessionStorage, including their silent no-op when the area is blocked.
  const area = (name, writable = true) => ({
    get: (key) => (stores[name].has(key) ? stores[name].get(key) : null),
    set: (key, value) => {
      if (writable) stores[name].set(key, value);
    },
    remove: (key) => stores[name].delete(key),
  });

  // Strip only module syntax; execute the complete production prompt implementation.
  vm.runInNewContext(
    `${promptSource.replace(/^import .*;\r?\n/m, '').replace('export const', 'const')}
    initPwaPrompts();`,
    {
      window,
      navigator: { onLine: online },
      document: dom.document,
      safeStorage: area('local'),
      safeSessionStorage: area('session', sessionWritable),
      ...timers.api,
    }
  );

  const cta = () => dom.body.querySelector('[data-install-cta]');
  const part = (selector) => cta()?.querySelector(selector) ?? null;
  const click = (selector) => part(selector).dispatchEvent(new Event('click'));

  return {
    timers,
    stores,
    get state() {
      const root = cta();
      if (!root) return 'absent';
      return root.hidden ? 'hidden' : root.getAttribute('data-install-state');
    },
    get visible() {
      const root = cta();
      if (!root || root.hidden) return [];
      return [
        part('[data-install-card]').hidden ? null : 'card',
        part('[data-install-action="expand"]').hidden ? null : 'chip',
      ].filter(Boolean);
    },
    get chipLabel() {
      return part('[data-install-action="expand"]')?.children.at(-1).textContent ?? null;
    },
    get activeElement() {
      return dom.document.activeElement;
    },
    get toastMessage() {
      const toast = dom.body.querySelector('[data-toast]');
      if (!toast || toast.hidden) return null;
      return toast.querySelector('[data-toast-message]').textContent;
    },
    part,
    offer(event = installEvent()) {
      window.dispatchEvent(event);
      return event;
    },
    installed() {
      window.dispatchEvent(new Event('appinstalled'));
    },
    install: () => click('[data-install-action="install"]'),
    dismiss: () => click('[data-install-action="dismiss"]'),
    expand: () => click('[data-install-action="expand"]'),
    focusOn: dom.focusOn,
    focusOut(relatedTarget = null) {
      dom.focusOn(relatedTarget);
      cta().dispatchEvent(Object.assign(new Event('focusout'), { relatedTarget }));
    },
  };
}

test('the session storage accessor stays silent when no Storage is reachable', () => {
  // Imported with no window at all, which is the harshest form of the blocked-storage case.
  assert.equal(safeSessionStorage.get(SESSION_KEY), null);
  assert.doesNotThrow(() => safeSessionStorage.set(SESSION_KEY, '1'));
  assert.doesNotThrow(() => safeSessionStorage.remove(SESSION_KEY));
  assert.equal(safeSessionStorage.get(SESSION_KEY), null);
});

test('no install UI exists until the browser offers an install opportunity', () => {
  const app = mount();
  assert.equal(app.state, 'absent');
  assert.equal(app.timers.created, 0);
});

test('an install opportunity opens the compact card and arms one 30 second timer', () => {
  const app = mount();
  const event = app.offer();
  assert.equal(event.prevented, 1, 'the browser mini-infobar is suppressed');
  assert.equal(event.prompts, 0, 'installation is never triggered automatically');
  assert.equal(app.state, 'expanded');
  assert.deepEqual(app.visible, ['card']);
  assert.deepEqual(app.timers.pending, [AUTO_COLLAPSE_DELAY]);
  assert.equal(app.part('[data-install-action="install"]').textContent, 'Zainstaluj');
  assert.equal(app.part('[data-install-action="dismiss"]').textContent, 'Nie teraz');
});

test('a previously completed installation keeps the whole install UI off the page', () => {
  const app = mount({ local: { [PERSISTENT_KEY]: '1' } });
  const event = app.offer();
  assert.equal(event.prevented, 1);
  assert.equal(app.state, 'absent');
  assert.equal(app.timers.created, 0);
});

test('a dismissal earlier in this session keeps the whole install UI off the page', () => {
  const app = mount({ session: { [SESSION_KEY]: '1' } });
  app.offer();
  assert.equal(app.state, 'absent');
  assert.equal(app.timers.created, 0);
});

test('inactivity collapses the card to a labelled chip instead of hiding the offer', () => {
  const app = mount();
  app.offer();
  app.timers.run();
  assert.equal(app.state, 'collapsed');
  assert.deepEqual(app.visible, ['chip']);
  assert.equal(app.chipLabel, 'VOLT APP');
  assert.equal(
    app.part('[data-install-action="expand"]').getAttribute('aria-label'),
    'Zainstaluj aplikację VOLT GARAGE'
  );
});

test('automatic collapse is not a dismissal and never records one', () => {
  const app = mount();
  app.offer();
  app.timers.run();
  assert.equal(app.stores.session.size, 0, 'no session dismissal is recorded');
  assert.equal(app.stores.local.size, 0, 'no persistent suppression is recorded');
  assert.deepEqual(app.timers.pending, [], 'the elapsed timer leaves nothing armed');
});

test('the chip reopens the card, moves focus onto the primary action and re-arms nothing', () => {
  const app = mount();
  app.offer();
  app.timers.run();
  app.expand();
  assert.equal(app.state, 'expanded');
  assert.deepEqual(app.visible, ['card']);
  assert.equal(app.activeElement, app.part('[data-install-action="install"]'));
  assert.deepEqual(app.timers.pending, [], 'a deliberate reopen is not collapsed again');
});

test('the deadline defers while focus is inside and completes once focus leaves', () => {
  const app = mount();
  app.offer();
  app.focusOn(app.part('[data-install-action="dismiss"]'));
  app.timers.run();
  assert.equal(app.state, 'expanded', 'a focused control is never pulled away');
  app.focusOut(app.part('[data-install-action="install"]'));
  assert.equal(app.state, 'expanded', 'focus moving within the card keeps it open');
  app.focusOut(null);
  assert.equal(app.state, 'collapsed');
});

test('a deferred collapse is abandoned when the visitor acts first', () => {
  const app = mount();
  app.offer();
  app.focusOn(app.part('[data-install-action="dismiss"]'));
  app.timers.run();
  app.dismiss();
  assert.equal(app.state, 'hidden');
  app.focusOut(null);
  assert.equal(app.state, 'hidden', 'a late focusout cannot resurrect the collapsed chip');
});

test('"Nie teraz" hides the offer and suppresses it for the rest of the session', () => {
  const app = mount();
  app.offer();
  app.dismiss();
  assert.equal(app.state, 'hidden');
  assert.deepEqual(app.visible, []);
  assert.equal(app.stores.session.get(SESSION_KEY), '1');
  assert.equal(app.stores.local.size, 0, 'the refusal does not outlive the tab');
  assert.deepEqual(app.timers.pending, [], 'the auto-collapse timer is cleared');
  app.offer();
  assert.equal(app.state, 'hidden', 'a re-fired event stays suppressed for this session');
});

test('blocked session storage degrades to the chip instead of throwing', () => {
  // safeSessionStorage swallows a refused write, so the module only ever sees a no-op.
  const app = mount({ sessionWritable: false });
  app.offer();
  app.dismiss();
  assert.equal(app.state, 'hidden');
  assert.equal(app.stores.session.size, 0);
  app.offer();
  assert.equal(app.state, 'collapsed', 'the offer degrades to the chip, never back to the card');
});

test('installing uses the deferred native prompt once and records the completed install', async () => {
  const app = mount();
  const event = app.offer();
  app.install();
  assert.equal(app.state, 'hidden', 'the UI steps aside for the native dialog');
  assert.deepEqual(app.timers.pending, []);
  assert.equal(event.prompts, 1);
  app.install();
  assert.equal(event.prompts, 1, 'the single-use deferred event is never prompted twice');
  await event.choose('accepted');
  assert.equal(app.stores.local.get(PERSISTENT_KEY), '1');
});

test('declining the native dialog records no suppression and offers only the chip later', async () => {
  const app = mount();
  const event = app.offer();
  app.install();
  await event.choose('dismissed');
  assert.equal(app.stores.local.size, 0);
  assert.equal(app.stores.session.size, 0);
  app.offer();
  assert.equal(app.state, 'collapsed');
  assert.equal(app.timers.created, 1, 'a re-fired event never arms a second timer');
});

test('a re-fired event leaves the state the visitor is already looking at alone', () => {
  const app = mount();
  app.offer();
  app.timers.run();
  app.offer();
  assert.equal(app.state, 'collapsed');
  app.expand();
  app.offer();
  assert.equal(app.state, 'expanded');
  assert.equal(app.timers.created, 1);
});

test('appinstalled clears the offer permanently', () => {
  const app = mount();
  app.offer();
  app.installed();
  assert.equal(app.state, 'hidden');
  assert.deepEqual(app.timers.pending, []);
  assert.equal(app.stores.local.get(PERSISTENT_KEY), '1');
  app.offer();
  assert.equal(app.state, 'hidden');
});

test('the install offer and the notification toast remain independent surfaces', () => {
  const app = mount({ online: false });
  assert.equal(app.toastMessage, 'Tryb offline: część funkcji może być ograniczona.');
  app.offer();
  assert.equal(app.state, 'expanded');
  app.timers.run();
  app.dismiss();
  // Every install state change must leave the toast channel untouched.
  assert.equal(app.state, 'hidden');
  assert.equal(app.toastMessage, 'Tryb offline: część funkcji może być ograniczona.');
  assert.equal(app.part('[data-toast]'), null, 'the toast is never nested inside the install UI');
});
