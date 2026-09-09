import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { renderGrid } from '../../js/features/products.js';
import { initFilters } from '../../js/features/filters.js';

const CATALOG = JSON.parse(
  await fs.readFile(new URL('../../public/data/products.json', import.meta.url), 'utf8')
);
const ORIGIN = 'https://volt-garage.invalid';
const SHOP_PATH = '/pages/shop.html';
const OBSERVER_OPTIONS = { rootMargin: '0px 0px -10% 0px', threshold: 0.12 };
const DEBOUNCE_MS = 200;

// Each lifecycle case needs a module whose observer slot has never been filled, so the assertions
// about a first call describe a real first call rather than whatever a neighbouring case left.
let loaded = 0;
async function loadReveal() {
  loaded += 1;
  const module = await import(`../../js/ui/reveal.js?case=${loaded}`);
  return module.initReveal;
}

function revealElement(rect) {
  const classes = new Set();
  const element = {
    rect: rect ?? { top: 10, bottom: 20 },
    classList: { add: (name) => classes.add(name) },
    getBoundingClientRect: () => element.rect,
    get revealed() {
      return classes.has('is-visible');
    },
  };
  return element;
}

// The reveal module re-reads the document on every call, so the harness swaps what it finds and
// records what each observer double is constructed with and asked to do.
function mountReveal({ innerHeight = 800 } = {}) {
  const observers = [];
  const timeline = [];
  const frames = [];
  const documentClasses = new Set();
  const state = { elements: [], reducedMotion: false };

  class ObserverDouble {
    constructor(callback, options) {
      this.index = observers.length;
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.unobserved = [];
      this.disconnects = 0;
      observers.push(this);
      timeline.push(`construct:${this.index}`);
    }

    get live() {
      return this.disconnects === 0;
    }

    observe(element) {
      this.observed.push(element);
    }

    unobserve(element) {
      this.unobserved.push(element);
    }

    disconnect() {
      this.disconnects += 1;
      timeline.push(`disconnect:${this.index}`);
    }

    intersect(entries) {
      this.callback(entries, this);
    }
  }

  globalThis.IntersectionObserver = ObserverDouble;
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  globalThis.window = {
    innerHeight,
    matchMedia: (query) => ({
      matches: state.reducedMotion && query.includes('prefers-reduced-motion: reduce'),
    }),
  };
  globalThis.document = {
    documentElement: { classList: { add: (name) => documentClasses.add(name) } },
    querySelectorAll: (selector) => (selector === '[data-reveal]' ? state.elements : []),
  };

  return {
    observers,
    timeline,
    documentClasses,
    get current() {
      return state.elements;
    },
    get live() {
      return observers.filter((observer) => observer.live);
    },
    reduceMotion(value = true) {
      state.reducedMotion = value;
    },
    paint(count, rect) {
      state.elements = Array.from({ length: count }, () => revealElement(rect && { ...rect }));
      return state.elements;
    },
    runFrames() {
      frames.splice(0).forEach((callback) => callback());
    },
  };
}

test('the first initReveal builds one observer over the current reveal elements', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal();
  const cards = reveal.paint(3);

  initReveal();

  assert.equal(reveal.observers.length, 1, 'exactly one observer is constructed');
  assert.deepEqual(reveal.timeline, ['construct:0'], 'a first call has nothing to release');
  assert.equal(reveal.live.length, 1);
  assert.deepEqual(reveal.observers[0].observed, cards, 'every reveal element is observed');
  assert.deepEqual(reveal.observers[0].options, OBSERVER_OPTIONS, 'observer configuration changed');
  assert.ok(reveal.documentClasses.has('reveal-ready'), 'the reveal-ready hook was lost');
});

test('a later initReveal releases the previous observer before its replacement exists', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal();

  reveal.paint(3);
  initReveal();
  const replaced = reveal.paint(4);
  initReveal();

  assert.deepEqual(
    reveal.timeline,
    ['construct:0', 'disconnect:0', 'construct:1'],
    'the previous observer must be released before the replacement is constructed'
  );
  assert.equal(reveal.live.length, 1, 'only the newest observer stays live');
  assert.equal(reveal.live[0], reveal.observers[1]);
  assert.deepEqual(
    reveal.observers[1].observed,
    replaced,
    'the replacement takes the new elements'
  );
});

test('repeated renders never accumulate live observers', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal();
  const renders = 8;

  for (let render = 0; render < renders; render += 1) {
    reveal.paint(6);
    initReveal();
  }

  const expected = ['construct:0'];
  for (let index = 1; index < renders; index += 1) {
    expected.push(`disconnect:${index - 1}`, `construct:${index}`);
  }

  assert.equal(reveal.observers.length, renders, 'each render arms its own observer');
  assert.equal(reveal.live.length, 1, 'a page must never hold more than one reveal observer');
  assert.deepEqual(reveal.timeline, expected, 'every construction is preceded by a release');
  assert.deepEqual(
    reveal.observers.map((observer) => observer.disconnects),
    [...Array(renders - 1).fill(1), 0],
    'every superseded observer is disconnected exactly once'
  );
});

test('a call that finds no reveal elements still releases the previous observer', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal();

  reveal.paint(3);
  initReveal();
  reveal.paint(0);
  initReveal();

  assert.equal(reveal.observers.length, 1, 'an empty document must not construct an observer');
  assert.equal(reveal.observers[0].disconnects, 1, 'cleanup must precede the no-elements return');
  assert.equal(reveal.live.length, 0, 'nothing may observe a document with no reveal elements');
});

test('a call under reduced motion releases the previous observer and reveals the elements', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal();

  reveal.paint(3);
  initReveal();
  const cards = reveal.paint(3);
  reveal.reduceMotion();
  initReveal();

  assert.equal(reveal.observers.length, 1, 'reduced motion must not construct an observer');
  assert.equal(
    reveal.observers[0].disconnects,
    1,
    'cleanup must precede the reduced-motion return'
  );
  assert.equal(reveal.live.length, 0, 'no observer survives a reduced-motion re-entry');
  assert.ok(
    cards.every((card) => card.revealed),
    'reduced motion still reveals every element'
  );
});

test('reduced motion reveals every element without observing or arming the transition', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal();
  reveal.reduceMotion();
  const cards = reveal.paint(4);

  initReveal();

  assert.equal(reveal.observers.length, 0, 'reduced motion observes nothing');
  assert.ok(
    cards.every((card) => card.revealed),
    'every element is shown outright'
  );
  assert.equal(
    reveal.documentClasses.has('reveal-ready'),
    false,
    'reduced motion must not arm the reveal transition'
  );
});

test('an intersecting element is revealed and then unobserved', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal();
  const [first, second] = reveal.paint(2, { top: 900, bottom: 1000 });

  initReveal();
  reveal.observers[0].intersect([
    { isIntersecting: true, target: first },
    { isIntersecting: false, target: second },
  ]);

  assert.ok(first.revealed, 'an intersecting element is revealed');
  assert.equal(second.revealed, false, 'a non-intersecting element is left alone');
  assert.deepEqual(reveal.observers[0].unobserved, [first], 'a revealed element is unobserved');
});

test('elements in view are revealed at once and the frame pass re-checks the viewport', async () => {
  const initReveal = await loadReveal();
  const reveal = mountReveal({ innerHeight: 800 });
  const [visible, pending] = reveal.paint(2, { top: 900, bottom: 1000 });
  visible.rect = { top: 100, bottom: 300 };

  initReveal();

  assert.ok(visible.revealed, 'an element already in view is revealed without waiting');
  assert.equal(pending.revealed, false, 'an element below the fold waits');

  pending.rect = { top: 200, bottom: 400 };
  reveal.runFrames();

  assert.ok(pending.revealed, 'the animation-frame pass still re-checks the viewport');
});

// renderGrid replaces the grid and re-arms reveal for the new cards. The container double mirrors
// that by re-reading the markup it is handed, so the observer sees what the render produced.
function mountGrid(reveal) {
  const container = {
    html: '',
    busy: null,
    renders: 0,
    setAttribute: (name, value) => {
      if (name === 'aria-busy') container.busy = value;
    },
    classList: { toggle: () => {} },
    get innerHTML() {
      return container.html;
    },
    set innerHTML(value) {
      container.html = value;
      container.renders += 1;
      reveal.paint((value.match(/\bdata-reveal\b/g) ?? []).length);
    },
  };
  return container;
}

test('renderGrid re-arms reveal for its cards without leaking an observer per render', () => {
  const reveal = mountReveal();
  globalThis.window.location = { pathname: SHOP_PATH, href: `${ORIGIN}${SHOP_PATH}` };
  const container = mountGrid(reveal);

  renderGrid(container, CATALOG.slice(0, 3));

  assert.equal(container.busy, 'false', 'the grid stops reporting itself busy');
  assert.equal(reveal.observers.length, 1, 'the rendered cards are observed');
  assert.equal(reveal.observers[0].observed.length, 3, 'every rendered card is observed');
  assert.deepEqual(reveal.observers[0].observed, reveal.current);

  renderGrid(container, CATALOG.slice(0, 7));

  assert.equal(reveal.observers.length, 2, 'the next render arms the next observer');
  assert.equal(reveal.observers[0].disconnects, 1, 'the superseded observer is released');
  assert.equal(reveal.observers[1].observed.length, 7, 'the replacement takes the new cards');
  assert.equal(reveal.live.length, 1);

  for (let render = 0; render < 20; render += 1) {
    renderGrid(container, CATALOG);
  }

  assert.equal(container.renders, 22, 'every call replaced the grid');
  assert.equal(reveal.observers.length, 22, 'reveal is still initialized for every render');
  assert.equal(reveal.live.length, 1, 'twenty-two renders leave exactly one live observer');
});

// A local fake clock keeps the debounce deterministic, matching the approach the cart feedback
// suite already uses instead of the experimental MockTimers API.
function fakeClock(t) {
  const pending = new Map();
  let now = 0;
  let sequence = 0;
  t.mock.method(globalThis, 'setTimeout', (fn, delay = 0) => {
    sequence += 1;
    pending.set(sequence, { fn, due: now + Number(delay) });
    return sequence;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => {
    pending.delete(id);
  });
  return (ms) => {
    const target = now + ms;
    for (;;) {
      const [next] = [...pending]
        .filter(([, timer]) => timer.due <= target)
        .sort(([idA, a], [idB, b]) => a.due - b.due || idA - idB);
      if (!next) break;
      const [id, timer] = next;
      pending.delete(id);
      now = timer.due;
      timer.fn();
    }
    now = target;
  };
}

function control(properties = {}) {
  const handlers = new Map();
  return {
    ...properties,
    addEventListener(type, handler) {
      const registered = handlers.get(type) ?? [];
      registered.push(handler);
      handlers.set(type, registered);
    },
    dispatch(type) {
      (handlers.get(type) ?? []).forEach((handler) => handler());
    },
  };
}

// The shop is exercised through the listeners initFilters actually registers. Only the clock, the
// catalog request, and the DOM are doubled, so the filtering, the rendered markup, the result
// count, and the ItemList payload are the real ones.
async function mountShop(t, { search = '' } = {}) {
  const advance = fakeClock(t);
  const jsonld = { writes: 0, payload: null };
  const head = { scripts: [] };
  head.querySelector = (selector) =>
    head.scripts.find(
      (node) => selector === `script[data-jsonld-key="${node.dataset.jsonldKey}"]`
    ) ?? null;
  head.appendChild = (node) => head.scripts.push(node);

  const container = {
    html: '',
    gridRenders: 0,
    loadingRenders: 0,
    setAttribute: () => {},
    classList: { toggle: () => {} },
    get innerHTML() {
      return container.html;
    },
    set innerHTML(value) {
      container.html = value;
      if (value.includes('card--skeleton')) container.loadingRenders += 1;
      else container.gridRenders += 1;
    },
  };

  const priceRange = control({ value: '1000' });
  const priceOutput = { textContent: '' };
  const categorySelect = control({
    value: 'all',
    options: ['all', ...new Set(CATALOG.map((product) => product.category))].map((value) => ({
      value,
    })),
  });
  const sortSelect = control({ value: 'featured' });
  const searchInput = control({ value: '' });
  const resultCount = { textContent: '', setAttribute: () => {} };
  const nodes = {
    '[data-products="shop"]': container,
    '#filter-category': categorySelect,
    '#filter-price': priceRange,
    '[data-price-output]': priceOutput,
    '#filter-sort': sortSelect,
    '[data-result-count]': resultCount,
    '[data-search-input]': searchInput,
  };

  globalThis.fetch = async () => ({ ok: true, json: async () => CATALOG });
  globalThis.window = {
    location: { pathname: SHOP_PATH, href: `${ORIGIN}${SHOP_PATH}${search}`, search },
  };
  globalThis.document = {
    baseURI: `${ORIGIN}${SHOP_PATH}`,
    head,
    createElement: () => {
      const node = { dataset: {}, type: '', remove: () => {} };
      Object.defineProperty(node, 'textContent', {
        get: () => (jsonld.payload ? JSON.stringify(jsonld.payload) : ''),
        set: (value) => {
          jsonld.writes += 1;
          jsonld.payload = JSON.parse(value);
        },
      });
      return node;
    },
    querySelector: (selector) => nodes[selector] ?? null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  await initFilters();

  return {
    advance,
    priceRange,
    priceOutput,
    categorySelect,
    sortSelect,
    searchInput,
    resultCount,
    jsonld,
    get gridRenders() {
      return container.gridRenders;
    },
    get loadingRenders() {
      return container.loadingRenders;
    },
    reset() {
      container.gridRenders = 0;
      jsonld.writes = 0;
    },
    rendered: () => [...container.html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]),
  };
}

const names = (products) => products.map((product) => product.name);

test('the shop paints its initial state without waiting for the debounce', async (t) => {
  const shop = await mountShop(t);

  assert.equal(shop.loadingRenders, 1, 'the skeleton is shown while the catalog loads');
  assert.equal(shop.gridRenders, 1, 'the first grid is painted immediately');
  assert.equal(shop.priceOutput.textContent, '1000', 'the slider value is shown before any input');
  assert.deepEqual(shop.rendered(), names(CATALOG), 'the unfiltered catalog is rendered');
});

test('a slider drag updates the visible price on every event and renders once it settles', async (t) => {
  const shop = await mountShop(t);
  shop.reset();

  const drag = [950, 900, 850, 800, 750, 700, 650, 600, 500, 400, 300, 200];
  for (const value of drag) {
    shop.priceRange.value = String(value);
    shop.priceRange.dispatch('input');
    assert.equal(shop.priceOutput.textContent, String(value), 'the price output must be immediate');
    assert.equal(shop.gridRenders, 0, 'raw slider input must not rebuild the grid');
    assert.equal(shop.jsonld.writes, 0, 'raw slider input must not rewrite the ItemList');
  }

  shop.advance(DEBOUNCE_MS - 1);
  assert.equal(shop.gridRenders, 0, 'the debounce window is still open');

  shop.advance(1);
  assert.equal(shop.gridRenders, 1, `${drag.length} slider events cost one render`);
  assert.equal(shop.jsonld.writes, 1, 'the ItemList is rewritten once');

  const expected = CATALOG.filter((product) => product.price <= drag.at(-1));
  assert.deepEqual(shop.rendered(), names(expected), 'the settled value decides the grid');
  assert.equal(shop.resultCount.textContent, `${expected.length} produktów`);
  assert.equal(shop.jsonld.payload.numberOfItems, expected.length);
  assert.deepEqual(
    shop.jsonld.payload.itemListElement.map((item) => item.name),
    names(expected),
    'the ItemList follows the settled slider value'
  );
});

test('the slider shares the search field debounce instead of scheduling its own', async (t) => {
  const shop = await mountShop(t);
  shop.reset();

  shop.priceRange.value = '300';
  shop.priceRange.dispatch('input');
  shop.advance(120);

  shop.searchInput.value = 'naklejki';
  shop.searchInput.dispatch('input');
  shop.advance(120);

  assert.equal(shop.gridRenders, 0, 'a second input restarts the one shared timer');

  shop.advance(80);
  assert.equal(shop.gridRenders, 1, 'both inputs settle into a single render');

  const expected = CATALOG.filter(
    (product) => product.price <= 300 && product.category === 'Naklejki'
  );
  assert.ok(expected.length, 'the query must match part of the catalog');
  assert.deepEqual(shop.rendered(), names(expected), 'the render reflects both controls');
});

test('category and sort changes still filter immediately', async (t) => {
  const category = CATALOG.find((product) => product.id === 'interior-ambient').category;
  const shop = await mountShop(t);
  shop.reset();

  shop.categorySelect.value = category;
  shop.categorySelect.dispatch('change');
  assert.equal(shop.gridRenders, 1, 'a category change filters without waiting');

  shop.sortSelect.value = 'price-desc';
  shop.sortSelect.dispatch('change');
  assert.equal(shop.gridRenders, 2, 'a sort change filters without waiting');

  const expected = CATALOG.filter((product) => product.category === category).sort(
    (a, b) => b.price - a.price
  );
  assert.deepEqual(shop.rendered(), names(expected), 'category and sort still decide the grid');

  shop.advance(1000);
  assert.equal(shop.gridRenders, 2, 'an immediate change leaves no timer behind');
});
