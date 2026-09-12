import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverHtml, renderHtml } from '../html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// The window the module opens on the viewport, repeated here so a change to either side has to
// be a decision rather than a drift.
const OBSERVER_OPTIONS = { rootMargin: '0px 0px 20% 0px', threshold: [0, 1] };
const LABEL = 'Wróć na górę';
const css = await fs.readFile(path.join(ROOT, 'css/partials/components.css'), 'utf8');
const ruleFor = (selector) => {
  const rule = css.match(new RegExp(String.raw`\n${selector} \{([\s\S]*?)\n\}`));
  assert.ok(rule, `${selector}: the stylesheet must carry this rule`);
  return rule[1];
};

for (const file of discoverHtml(ROOT)) {
  test(`${file}: renders one scroll-to-top control beside the footer it watches`, async () => {
    const html = await renderHtml(ROOT, file, await fs.readFile(path.join(ROOT, file), 'utf8'));
    const controls = [
      ...html.matchAll(/<button\b[^>]*\bdata-scroll-top(?![-\w])[\s\S]*?<\/button>/g),
    ].map((match) => match[0]);
    assert.equal(controls.length, 1, 'the shared shell renders exactly one control');
    const [control] = controls;
    // A real control rather than a link dressed as one: there is no route to remember and no
    // hash for the back button to restore.
    assert.match(control, /type="button"/);
    assert.doesNotMatch(control, /<a\b|href="#top"/);
    assert.match(control, new RegExp(`aria-label="${LABEL}"`), 'the control names itself');
    // The artwork is decorative and comes from the sprite, so it neither carries that name nor
    // takes focus of its own.
    assert.match(control, /<use href="#icon-chevron-up"><\/use>/);
    assert.match(control, /<svg\b[^>]*\baria-hidden="true"/);
    assert.match(control, /<svg\b[^>]*\bfocusable="false"/);
    assert.doesNotMatch(control, /<path|tabindex=|style=/);

    const footer = html.match(/<footer\b[^>]*>/)?.[0];
    assert.ok(footer, 'the shared footer must render');
    assert.match(footer, /data-scroll-top-target/, 'the footer is what the observer watches');
    assert.equal((html.match(/data-scroll-top-target/g) || []).length, 1, 'one observed target');
    // The control is fixed to the viewport, so it belongs beside the footer rather than inside
    // its layout, where it would take part in the flow and move the footer's own content.
    assert.ok(
      html.indexOf('class="scroll-top"') > html.indexOf('</footer>'),
      `${file}: the control must render outside the footer element`
    );
  });
}

test('the control is inert, not merely invisible, until the state class arrives', () => {
  const hidden = ruleFor(String.raw`\.scroll-top`);
  // Fixed positioning is what keeps the control out of the document flow: nothing reserves
  // space for it, so its arrival cannot shift the page.
  assert.match(hidden, /position: fixed;/);
  assert.match(hidden, /opacity: 0;/);
  // Opacity alone would leave a transparent button that still swallows taps and still answers
  // the Tab key, so the hidden state has to be a visibility one.
  assert.match(hidden, /visibility: hidden;/);
  const visible = ruleFor(String.raw`\.scroll-top\.is-visible`);
  assert.match(visible, /opacity: 1;/);
  assert.match(visible, /visibility: visible;/);
  // The offsets ride the spacing tokens, so the control keeps its distance from the viewport
  // edge, and both themes are served by the same tokens rather than a second palette.
  assert.match(hidden, /--scroll-top-inline: var\(--space-\d+\);/);
  assert.match(hidden, /--scroll-top-block: var\(--space-\d+\);/);
  assert.match(hidden, /right: var\(--scroll-top-inline\);/);
  assert.match(
    hidden,
    /bottom: calc\(var\(--scroll-top-block\) \+ var\(--scroll-top-clearance\)\);/
  );
  assert.match(hidden, /background: var\(--color-surface\);/);
  assert.match(hidden, /color: var\(--color-muted\);/);
  assert.doesNotMatch(hidden, /#[0-9a-f]{3,8}\b/i, 'no hard-coded colours');
});

// Each case needs a module whose observer slot has never been filled, so assertions about a
// first call describe a real first call rather than what a neighbouring case left behind.
let loaded = 0;
async function loadScrollTop() {
  loaded += 1;
  const module = await import(`../../js/ui/scroll-top.js?case=${loaded}`);
  return module.initScrollTop;
}

// The module re-reads the document on every call, so the harness owns what it finds there and
// records what the observer double is constructed with, what the button is bound to, and every
// scroll the module asks the viewport for.
function mountScrollTop({ scrollHeight = 4000, innerHeight = 800 } = {}) {
  const observers = [];
  const scrolls = [];
  const listeners = [];
  const classes = new Set();
  const state = { scrollHeight, innerHeight, reducedMotion: false, button: null, target: null };

  class ObserverDouble {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.disconnects = 0;
      observers.push(this);
    }

    get live() {
      return this.disconnects === 0;
    }

    observe(element) {
      this.observed.push(element);
    }

    disconnect() {
      this.disconnects += 1;
    }

    intersect(isIntersecting) {
      this.callback([{ target: this.observed[0], isIntersecting }], this);
    }
  }

  const button = {
    handlers: [],
    classList: {
      toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
    },
    addEventListener: (type, handler) => button.handlers.push({ type, handler }),
    removeEventListener: (type, handler) => {
      const index = button.handlers.findIndex(
        (entry) => entry.type === type && entry.handler === handler
      );
      if (index >= 0) button.handlers.splice(index, 1);
    },
    click: () =>
      button.handlers.forEach((entry) => {
        if (entry.type === 'click') entry.handler();
      }),
  };
  state.button = button;
  state.target = { name: 'footer' };

  globalThis.IntersectionObserver = ObserverDouble;
  globalThis.window = {
    get innerHeight() {
      return state.innerHeight;
    },
    matchMedia: (query) => ({
      get matches() {
        return state.reducedMotion && query.includes('prefers-reduced-motion: reduce');
      },
    }),
    scrollTo: (options) => scrolls.push(options),
    addEventListener: (type) => listeners.push(type),
  };
  globalThis.document = {
    documentElement: {
      get scrollHeight() {
        return state.scrollHeight;
      },
    },
    addEventListener: (type) => listeners.push(type),
    querySelector: (selector) => {
      if (selector === '[data-scroll-top]') return state.button;
      if (selector === '[data-scroll-top-target]') return state.target;
      return null;
    },
  };

  return {
    observers,
    scrolls,
    listeners,
    button,
    get observer() {
      return observers.at(-1);
    },
    get live() {
      return observers.filter((observer) => observer.live);
    },
    get visible() {
      return classes.has('is-visible');
    },
    get target() {
      return state.target;
    },
    resize({ scrollHeight, innerHeight }) {
      if (scrollHeight !== undefined) state.scrollHeight = scrollHeight;
      if (innerHeight !== undefined) state.innerHeight = innerHeight;
    },
    reduceMotion(value = true) {
      state.reducedMotion = value;
    },
    remove({ button: dropButton = false, target = false } = {}) {
      if (dropButton) state.button = null;
      if (target) state.target = null;
    },
  };
}

test('one observer watches the footer, and nothing listens to the scroll itself', async () => {
  const initScrollTop = await loadScrollTop();
  const page = mountScrollTop();
  initScrollTop();
  assert.equal(page.observers.length, 1);
  assert.deepEqual(page.observer.options, OBSERVER_OPTIONS);
  assert.deepEqual(page.observer.observed, [page.target]);
  page.observer.intersect(true);
  page.observer.intersect(false);
  assert.deepEqual(page.listeners, [], 'visibility never costs a scroll or resize listener');
  assert.deepEqual(
    page.button.handlers.map((entry) => entry.type),
    ['click'],
    'the button is bound once, for its own activation'
  );
});

test('the control keeps out of the way until the footer reaches the viewport', async () => {
  const initScrollTop = await loadScrollTop();
  const page = mountScrollTop();
  initScrollTop();
  assert.equal(page.visible, false, 'the default state is hidden');
  page.observer.intersect(false);
  assert.equal(page.visible, false, 'reading down the page changes nothing');
  page.observer.intersect(true);
  assert.equal(page.visible, true, 'the footer arriving reveals the control');
  page.observer.intersect(false);
  assert.equal(page.visible, false, 'scrolling back up puts it away again');
});

test('a page with nowhere to scroll back from never offers the trip', async () => {
  const initScrollTop = await loadScrollTop();
  // A short page has its footer in view from the first paint, so the observer reports an
  // arrival the visitor never travelled to.
  const page = mountScrollTop({ scrollHeight: 1000, innerHeight: 800 });
  initScrollTop();
  page.observer.intersect(true);
  assert.equal(page.visible, false, 'a couple of hundred pixels of travel is not a journey');
  page.resize({ scrollHeight: 4000 });
  page.observer.intersect(true);
  assert.equal(page.visible, true, 'a page that grew is judged on what it is now');
  // A filtered grid can shorten the page under a control that is already showing; the ratio
  // crossing that follows is what lets the module take it back.
  page.resize({ scrollHeight: 1000 });
  page.observer.intersect(true);
  assert.equal(page.visible, false, 'and so is a page that shrank');
});

test('activation returns the document to the top, smoothly by default', async () => {
  const initScrollTop = await loadScrollTop();
  const page = mountScrollTop();
  initScrollTop();
  page.observer.intersect(true);
  page.button.click();
  assert.deepEqual(page.scrolls, [{ top: 0, behavior: 'smooth' }]);
});

test('a reduced-motion visitor arrives at the top without the animation', async () => {
  const initScrollTop = await loadScrollTop();
  const page = mountScrollTop();
  page.reduceMotion();
  initScrollTop();
  page.button.click();
  // 'auto' would defer to the smooth scroll-behavior the stylesheet sets on the root, so the
  // module has to name the instant jump outright.
  assert.deepEqual(page.scrolls, [{ top: 0, behavior: 'instant' }]);
  // The preference is read per activation rather than captured at initialization.
  page.reduceMotion(false);
  page.button.click();
  assert.deepEqual(page.scrolls.at(-1), { top: 0, behavior: 'smooth' });
});

test('a document missing the control or its footer initializes quietly', async () => {
  for (const missing of [{ button: true }, { target: true }]) {
    const initScrollTop = await loadScrollTop();
    const page = mountScrollTop();
    page.remove(missing);
    assert.doesNotThrow(initScrollTop);
    assert.deepEqual(page.observers, [], 'nothing is observed without both halves');
    assert.deepEqual(page.button.handlers, [], 'nothing is bound to a control that cannot act');
  }
});

test('re-initializing releases the previous observer and binding', async () => {
  const initScrollTop = await loadScrollTop();
  const page = mountScrollTop();
  initScrollTop();
  const first = page.observer;
  initScrollTop();
  assert.equal(first.live, false, 'the previous observer is disconnected');
  assert.deepEqual(page.live, [page.observer]);
  assert.equal(page.button.handlers.length, 1, 'activation never stacks up handlers');
  page.observer.intersect(true);
  page.button.click();
  assert.deepEqual(page.scrolls, [{ top: 0, behavior: 'smooth' }], 'one scroll per activation');
});
