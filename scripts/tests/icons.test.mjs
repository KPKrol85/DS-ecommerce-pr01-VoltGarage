import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { discoverHtml, renderHtml } from '../html.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = await fs.readFile(new URL('../../icons.js', import.meta.url), 'utf8');
// Fingerprints of the approved path data, including the supplied complete Instagram SVG.
const approved = {
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
};
const symbols = [
  ...source.matchAll(/<symbol id="icon-([^"]+)" viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g),
];

test('all six unique symbols preserve approved path geometry and viewBoxes', () => {
  assert.equal(symbols.length, 6);
  assert.deepEqual(symbols.map((m) => m[1]).sort(), Object.keys(approved).sort());
  for (const [, name, viewBox, body] of symbols) {
    assert.equal(viewBox, approved[name].viewBox);
    const geometry = [...body.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]).join('\n');
    assert.equal(createHash('sha256').update(geometry).digest('hex'), approved[name].hash, name);
  }
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of source.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(id), id);
  for (const name of ['email', 'phone', 'x', 'github']) {
    assert.match(symbols.find((m) => m[1] === name)[3], /fill="currentColor"/);
  }
  const instagram = symbols.find((m) => m[1] === 'instagram')[3];
  assert.equal((instagram.match(/<radialGradient /g) || []).length, 2);
  assert.match(instagram, /fill="white"/);
  assert.match(symbols.find((m) => m[1] === 'facebook')[3], /fill="#1977F3"/);
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
  test(`${file}: rendered contact and social icons use accessible symbol references`, async () => {
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
    assert.equal(uses.length, file === 'pages/contact.html' ? 8 : 6);
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

test('temporary standalone source icons are no longer published', async () => {
  await assert.rejects(fs.stat(new URL('../../public/assets/icons/svg-icons/', import.meta.url)), {
    code: 'ENOENT',
  });
});
