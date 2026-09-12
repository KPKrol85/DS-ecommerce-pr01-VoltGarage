import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { discoverHtml, renderHtml } from '../html.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = await fs.readFile(new URL('../../icons.js', import.meta.url), 'utf8');
// Fingerprints of the approved path data, including the supplied complete Instagram SVG.
const approved = {
  cart: {
    viewBox: '0 0 32 32',
    hash: '826b712308fb46b8901ceb657f0da3bb35b95454fa7ebd3beb81e0cbc4d5f427',
  },
  email: {
    viewBox: '0 0 31 23',
    hash: 'f557e58eacfb58a23bc7c5ced539a316a061a36997ff56d10de66998c57a4885',
  },
  phone: {
    viewBox: '0 0 32 32',
    hash: '17e60a7d3fdbba3356a149bd4aed6d499dff5e6e098a7628307051d029967c4c',
  },
  instagram: {
    viewBox: '0 0 32 32',
    hash: 'b4e14342b412fad5956cb6ddbf3e5efc8e0d4500778bfb75913ab0aa5bda25f5',
  },
  x: {
    viewBox: '0 0 33 32',
    hash: '0132ae94927db511bc57c7b7529844afb52a5173b14eb4dca8f99bab49e55f5f',
  },
  github: {
    viewBox: '0 0 32 32',
    hash: '6a5e32c8ac644f0c0d81aac50724bf592305286c71c78a1e81a7049008761847',
  },
  facebook: {
    viewBox: '0 0 32 32',
    hash: 'e1aa4077e09b2fa003497d73b6adb0a1eb34834b76cd19499e938bebec14dfa5',
  },
  // Both chevrons keep the viewBox and path the supplied sources were drawn in: the down
  // chevron's stroke fills its 35x20 box edge to edge, the up chevron sits inside a 60x60 one.
  'chevron-down': {
    viewBox: '0 0 35 20',
    hash: '10c58322c1cdd53ba309e0f0c82913cf3aa350324b8f2ef09387f0731e55e65a',
  },
  'chevron-up': {
    viewBox: '0 0 60 60',
    hash: '1e4737ab25c43e013665b64a96e7c49b3befa8e23b3ab8a222f25a115dd1abde',
  },
};
const symbols = [
  ...source.matchAll(/<symbol id="icon-([^"]+)" viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g),
];
// Which documents claim the downward chevron, and how many times. A document absent from this
// map renders none, so a new consumer has to be declared here rather than appearing unnoticed.
const DOWNWARD_CHEVRONS = {
  'pages/shop.html': { class: 'select-chevron', count: 2 },
  'pages/faq.html': { class: 'faq-item__icon', count: 12 },
};

test('all nine unique symbols preserve approved path geometry and viewBoxes', () => {
  assert.equal(symbols.length, 9);
  assert.deepEqual(symbols.map((m) => m[1]).sort(), Object.keys(approved).sort());
  for (const [, name, viewBox, body] of symbols) {
    assert.equal(viewBox, approved[name].viewBox);
    const geometry = [...body.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]).join('\n');
    assert.equal(createHash('sha256').update(geometry).digest('hex'), approved[name].hash, name);
  }
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of source.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(id), id);
  for (const name of ['email', 'phone', 'x', 'github', 'cart']) {
    assert.match(symbols.find((m) => m[1] === name)[3], /fill="currentColor"/);
  }
  // The chevrons are the one stroked pair, so the UI color they inherit rides the stroke. The
  // sources shipped a hard-coded black; only that may change on the way into the sprite.
  for (const name of ['chevron-down', 'chevron-up']) {
    const chevron = symbols.find((m) => m[1] === name)[3];
    assert.equal((chevron.match(/<path\b/g) || []).length, 1, name);
    assert.match(chevron, /stroke="currentColor"/, name);
    assert.match(chevron, /stroke-width="5"/, name);
    assert.match(chevron, /stroke-linecap="round" stroke-linejoin="round"/, name);
    assert.doesNotMatch(chevron, /\bfill="/, name);
  }
  assert.doesNotMatch(source, /="black"/);
  const instagram = symbols.find((m) => m[1] === 'instagram')[3];
  assert.equal((instagram.match(/<radialGradient /g) || []).length, 2);
  assert.match(instagram, /fill="white"/);
  assert.match(symbols.find((m) => m[1] === 'facebook')[3], /fill="#1977F3"/);
});

// The chevrons are one stroke and its mirror, so swapping the two names would satisfy every
// assertion above: each hash would still match some entry in the inventory. Read the apex out
// of the path instead, so the sprite cannot start serving an up arrow to a closed dropdown.
test('each chevron points the way its name promises, centred in its own viewBox', () => {
  for (const [name, direction] of [
    ['chevron-down', 'down'],
    ['chevron-up', 'up'],
  ]) {
    const geometry = symbols.find((m) => m[1] === name)[3].match(/\bd="([^"]+)"/)[1];
    const points = [...geometry.matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map(([, x, y]) => ({
      x: Number(x),
      y: Number(y),
    }));
    assert.equal(points.length, 3, `${name}: a chevron is two arms meeting at one apex`);
    const [start, apex, end] = points;
    assert.ok(start.x < apex.x && apex.x < end.x, `${name}: the stroke must run left to right`);
    assert.equal(start.y, end.y, `${name}: the arms must end level with each other`);
    // SVG y grows downwards, so a down chevron's apex is its lowest point on screen.
    assert.equal(
      apex.y > start.y,
      direction === 'down',
      `${name}: this chevron points the wrong way`
    );
    const width = Number(approved[name].viewBox.split(' ')[2]);
    assert.equal(apex.x, width / 2, `${name}: the apex must sit on the centre of the viewBox`);
  }
});

test('mounting repeatedly, even from another module instance, inserts one decorative sprite', () => {
  let mounted;
  let insertions = 0;
  const document = {
    body: {
      prepend(node) {
        mounted = node;
        insertions++;
      },
    },
    getElementById(id) {
      assert.equal(id, 'volt-icon-sprite');
      return mounted;
    },
    createElement(name) {
      assert.equal(name, 'template');
      return {
        set innerHTML(markup) {
          assert.match(
            markup,
            /<svg id="volt-icon-sprite"[^>]*width="0" height="0" aria-hidden="true" focusable="false"/
          );
          this.content = { firstElementChild: { markup } };
        },
      };
    },
  };
  const load = () =>
    vm.runInNewContext(
      source.replace('export const mountIconSprite', 'const mountIconSprite') +
        '\nmountIconSprite;',
      { document }
    );
  const mount = load();
  mount();
  mount();
  load()();
  assert.equal(insertions, 1);
  document.body = null;
  assert.doesNotThrow(mount);
});

for (const file of discoverHtml(root)) {
  test(`${file}: rendered contact, social, cart and chevron icons use accessible symbol references`, async () => {
    const html = await renderHtml(
      root,
      file,
      await fs.readFile(new URL('../../' + file, import.meta.url), 'utf8')
    );
    const social = [...html.matchAll(/<a\s+class="footer-social-link"[\s\S]*?<\/a>/g)].map(
      (m) => m[0]
    );
    assert.equal(social.length, 4);
    assert.deepEqual(social.map((a) => a.match(/aria-label="([^"]+)"/)[1]).sort(), [
      'Facebook',
      'GitHub',
      'Instagram',
      'X',
    ]);
    for (const link of social) {
      const name = link.match(/aria-label="([^"]+)"/)[1].toLowerCase();
      assert.ok(link.includes(`href="#icon-${name}"`));
      assert.match(link, /rel="noopener noreferrer"/);
      assert.match(link, /target="_blank"/);
      assert.doesNotMatch(link, /<path|tabindex=/);
    }
    const uses = [
      ...html.matchAll(/<svg\b([^>]*)>\s*<use href="#icon-([^"]+)"><\/use>\s*<\/svg>/g),
    ];
    const hasSummary = ['pages/cart.html', 'pages/checkout.html'].includes(file);
    const cartIcons = uses.filter((m) => m[2] === 'cart');
    assert.equal(cartIcons.length, hasSummary ? 2 : 1);
    // The downward chevron has exactly two consumers, each naming itself with its own class:
    // the shop filter panel, where it replaces two system select arrows, and the FAQ, where one
    // per question turns to show whether that answer is open. The upward one belongs to the
    // scroll-to-top control in the shared shell, so every document carries exactly one, after
    // the footer that control watches.
    const downward = DOWNWARD_CHEVRONS[file] ?? { class: null, count: 0 };
    const isShop = file === 'pages/shop.html';
    const chevrons = uses.filter((m) => m[2].startsWith('chevron-'));
    assert.deepEqual(
      chevrons.map((m) => m[2]),
      [...Array.from({ length: downward.count }, () => 'chevron-down'), 'chevron-up'],
      `${file}: unexpected chevron inventory`
    );
    assert.equal(
      uses.length,
      (file === 'pages/contact.html' ? 8 : 6) + cartIcons.length + chevrons.length
    );
    for (const [, attributes, name] of chevrons) {
      const [className, viewBox] =
        name === 'chevron-up' ? ['scroll-top__icon', '0 0 60 60'] : [downward.class, '0 0 35 20'];
      assert.match(attributes, new RegExp(`class="${className}"`), name);
      assert.match(attributes, new RegExp(`viewBox="${viewBox}"`), name);
    }
    for (const id of isShop ? ['filter-category', 'filter-sort'] : []) {
      // The select keeps every native semantic; the icon is a sibling, so it can never be read
      // as option content, and appearance:none is only ever paired with a supplied chevron.
      const group = html.match(
        new RegExp(
          String.raw`<div class="select-input">\s*<select\b[^>]*\bid="${id}"[\s\S]*?</div>`
        )
      );
      assert.ok(group, `${id} must sit in a .select-input wrapper`);
      assert.match(group[0], /<\/select>\s*<svg\b[^>]*\bclass="select-chevron"/, id);
      assert.doesNotMatch(group[0], /<select\b[^>]*\s(?:role|tabindex|aria-expanded)=/, id);
      assert.doesNotMatch(group[0], /<option\b[^>]*>[^<]*<svg/, id);
    }
    for (const [, attributes] of cartIcons) {
      assert.match(attributes, /viewBox="0 0 32 32"/);
      assert.match(attributes, /width="24"/);
      assert.match(attributes, /height="24"/);
      assert.doesNotMatch(attributes, /\bstroke(?:-[a-z]+)?=/);
    }
    const cartLink = html.match(/<a class="cart-link"[\s\S]*?<\/a>/)[0];
    assert.match(cartLink, /aria-label="Koszyk"/);
    assert.match(cartLink, /<use href="#icon-cart"><\/use>/);
    assert.match(cartLink, /data-cart-count>0<\/span>/);
    assert.doesNotMatch(cartLink, /<path/);
    const href = cartLink.match(/href="([^"]+)"/)[1];
    assert.equal(new URL(href, 'https://volt-garage.invalid/' + file).pathname, '/pages/cart.html');
    if (hasSummary) {
      const summary = html.match(/<h[23]>\s*Podsumowanie[\s\S]*?<\/h[23]>/)[0];
      assert.match(summary, /<use href="#icon-cart"><\/use>/);
      assert.doesNotMatch(summary, /<path/);
    }
    for (const [, attributes] of uses) {
      assert.match(attributes, /aria-hidden="true"/);
      assert.match(attributes, /focusable="false"/);
    }
    for (const name of ['phone', 'email']) {
      assert.equal(uses.filter((m) => m[2] === name).length, file === 'pages/contact.html' ? 2 : 1);
    }
    assert.match(html, /href="tel:\+48533537091"/);
    assert.match(html, /href="mailto:kontakt@kp-code.pl"/);
    assert.doesNotMatch(html, /linkedin/i);
  });
}

// The upward chevron now has one consumer: the scroll-to-top control the shared shell renders.
// Claimed once has to mean claimed through the sprite, so the artwork itself is searched for as
// well - a page that grew its own copy of the stroke would satisfy every assertion above.
test('the upward chevron is claimed once per document, by the shared control', async () => {
  assert.match(source, /<symbol id="icon-chevron-up" /, 'the sprite must define the symbol');
  const geometry = symbols.find((m) => m[1] === 'chevron-up')[3].match(/\bd="([^"]+)"/)[1];
  for (const file of discoverHtml(root)) {
    const html = await renderHtml(
      root,
      file,
      await fs.readFile(new URL('../../' + file, import.meta.url), 'utf8')
    );
    assert.equal(
      (html.match(/<use href="#icon-chevron-up"><\/use>/g) || []).length,
      1,
      `${file}: the upward chevron is rendered once, by the scroll-to-top control`
    );
    assert.equal(
      (html.match(/data-scroll-top(?![-\w])/g) || []).length,
      1,
      `${file}: one scroll-to-top control per document`
    );
    assert.ok(!html.includes(geometry), `${file}: the chevron artwork belongs to the sprite`);
  }
  // Neither a stylesheet nor a module may reintroduce what the sprite already publishes: the
  // control reaches the symbol through the reference in the shared partial and nowhere else.
  for (const directory of ['css', 'js']) {
    const entries = await fs.readdir(new URL(`../../${directory}/`, import.meta.url), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(entry.parentPath, entry.name);
      const contents = await fs.readFile(file, 'utf8');
      const name = path.relative(root, file).split(path.sep).join('/');
      assert.ok(!contents.includes(geometry), `${name}: duplicates the chevron artwork`);
      assert.ok(!contents.includes('icon-chevron-up'), `${name}: claims the shared symbol`);
    }
  }
});

test('temporary standalone source icons are no longer published', async () => {
  const sources = [
    'public/assets/icons/svg-icons/',
    'public/assets/icons/Vector.svg',
    'public/assets/icons/chevron-up_svgrepo.com.svg',
  ];
  for (const file of sources) {
    await assert.rejects(
      fs.stat(new URL('../../' + file, import.meta.url)),
      { code: 'ENOENT' },
      file
    );
  }
});
