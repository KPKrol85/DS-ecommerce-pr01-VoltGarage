import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fg from 'fast-glob';
import { discoverHtml } from '../html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const THEMES = 'css/partials/themes.css';
const FONT_ROOT = 'public/assets/fonts';

// Manrope ships as upstream static WOFF2, one file per declared weight. Space Grotesk ships as
// the upstream weight-axis font, so one face covers its whole range. See THIRD-PARTY-NOTICES.md
// for provenance; the digests below pin the exact upstream artifacts recorded there.
const FACES = [
  {
    family: 'Manrope',
    weight: '400',
    url: '/assets/fonts/manrope/Manrope-400.woff2',
    sha256: '4d459ffc3fdb884cd88587cc3e4170b16f4ebbbf2ad9ccf29cbcc0058d02433f',
  },
  {
    family: 'Manrope',
    weight: '500',
    url: '/assets/fonts/manrope/Manrope-500.woff2',
    sha256: '3f17e0e8556002b8fc78460bb500ecfa251856c663984a411b3df7b1dc9eed7d',
  },
  {
    family: 'Manrope',
    weight: '600',
    url: '/assets/fonts/manrope/Manrope-600.woff2',
    sha256: '4b751c7594f0619ec9259c9f5564e0245944cdf0f564b1a3bec612eb98ea8ee1',
  },
  {
    family: 'Manrope',
    weight: '700',
    url: '/assets/fonts/manrope/Manrope-700.woff2',
    sha256: 'e2973bfb74a2aca9356d289ee91f6c8a22da3fbef8aaeeb64a9bce2bf09295d1',
  },
  {
    family: 'Space Grotesk',
    weight: '300 700',
    url: '/assets/fonts/space-grotesk/SpaceGrotesk-Variable.woff2',
    sha256: '8e085aa438094f11487a836652edd5c054fa6a96f63fc7c282105ee3a4b08c07',
  },
];

// Only the display font is preloaded: it paints the hero heading, and one file serves every
// Space Grotesk weight. The Manrope weights rely on font-display: swap rather than competing
// with the preloaded hero image, which is the measured LCP resource.
const PRELOADED = ['/assets/fonts/space-grotesk/SpaceGrotesk-Variable.woff2'];

// Filenames that must never come back: the Google Fonts latin-ext subset slices that shipped
// with no unicode-range, and the locally produced variable container that replaced them.
const RETIRED = ['SpaceGrotesk-500.woff2', 'SpaceGrotesk-600.woff2', 'Manrope-Variable.woff2'];

const readThemes = () => fs.readFile(path.join(ROOT, THEMES), 'utf8');
const unquote = (value) => value.replace(/^['"]|['"]$/g, '');

function parseFontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) =>
    Object.fromEntries(
      match[1]
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const separator = entry.indexOf(':');
          return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
        })
    )
  );
}

test('the stylesheet declares exactly the expected faces, weights and files', async () => {
  const faces = parseFontFaces(await readThemes());
  assert.equal(faces.length, FACES.length, `${THEMES}: unexpected @font-face count`);
  for (const [index, expected] of FACES.entries()) {
    const face = faces[index];
    const label = `${expected.family} ${expected.weight}`;
    assert.equal(unquote(face['font-family']), expected.family, `${label}: font-family`);
    assert.equal(face['font-weight'], expected.weight, `${label}: font-weight`);
    assert.equal(face['font-style'], 'normal', `${label}: font-style`);
    // Preserved from the original contract: text stays visible while the font loads.
    assert.equal(face['font-display'], 'swap', `${label}: font-display`);
    assert.equal(unquote(face.src.match(/url\(\s*(['"]?)([^'")]+)\1\s*\)/)[2]), expected.url);
    assert.match(face.src, /format\('woff2'\)/, `${label}: woff2 format hint`);
    // A subset slice is only safe to serve behind unicode-range. These files are not subsets.
    assert.ok(!('unicode-range' in face), `${label}: unexpected unicode-range`);
  }
  // Four static Manrope weights plus one variable Space Grotesk.
  assert.deepEqual(
    faces.map((face) => unquote(face['font-family'])),
    ['Manrope', 'Manrope', 'Manrope', 'Manrope', 'Space Grotesk']
  );
});

test('every weight the stylesheets use resolves to a declared face', async () => {
  const expand = ({ family, weight }) => {
    if (!weight.includes(' ')) return [`${family} ${weight}`];
    const [min, max] = weight.split(/\s+/).map(Number);
    return Array.from(
      { length: (max - min) / 100 + 1 },
      (_, step) => `${family} ${min + step * 100}`
    );
  };
  const declared = new Set(FACES.flatMap(expand));
  const weights = new Set();
  for (const file of await fg('css/**/*.css', { cwd: ROOT })) {
    const css = await fs.readFile(path.join(ROOT, file), 'utf8');
    for (const match of css.matchAll(/font-weight:\s*(\d{3})\s*;/g)) weights.add(Number(match[1]));
    for (const match of css.matchAll(/--fw-\d+:\s*(\d{3})\s*;/g)) weights.add(Number(match[1]));
  }
  // Headings and <strong> inherit the UA bold default, and the body default applies wherever no
  // rule sets a weight. Neither is spelled out in a declaration.
  weights.add(700);
  weights.add(400);
  assert.ok(weights.size > 1, 'expected to find font-weight usages');
  // Both families are reachable through the same --fw-* tokens, so each needs every weight.
  for (const weight of weights) {
    for (const family of ['Manrope', 'Space Grotesk']) {
      assert.ok(
        declared.has(`${family} ${weight}`),
        `${family}: weight ${weight} is used in CSS but no @font-face provides it`
      );
    }
  }
});

test('the bundled inventory is exactly the declared files plus their licenses', async () => {
  for (const directory of ['manrope', 'space-grotesk']) {
    const expected = FACES.filter((face) => face.url.includes(`/${directory}/`)).map((face) =>
      path.posix.basename(face.url)
    );
    assert.deepEqual(
      (await fs.readdir(path.join(ROOT, FONT_ROOT, directory))).sort(),
      ['OFL.txt', ...expected].sort(),
      `${FONT_ROOT}/${directory}: unexpected bundled font inventory`
    );
  }
  const bundled = await fg('**/*.woff2', { cwd: path.join(ROOT, FONT_ROOT) });
  assert.deepEqual(
    bundled.sort(),
    FACES.map((face) => face.url.replace('/assets/fonts/', '')).sort()
  );
  // Retired artifacts must not reappear as assets or as references left behind in sources.
  // AUDIT.md and the changelog are historical records that describe the defect, and this file
  // has to spell the retired names out to forbid them; none of them is a live reference.
  const sources = await fg('**/*.{html,css,js,mjs,json,md}', {
    cwd: ROOT,
    ignore: [
      'node_modules/**',
      'dist/**',
      'package-lock.json',
      'AUDIT.md',
      'docs/CHANGELOG.md',
      'scripts/tests/font-contract.test.mjs',
    ],
  });
  for (const name of RETIRED) {
    assert.ok(!bundled.some((file) => file.endsWith(name)), `${name}: retired font still bundled`);
    for (const file of sources) {
      const content = await fs.readFile(path.join(ROOT, file), 'utf8');
      assert.ok(!content.includes(name), `${file}: still references retired font ${name}`);
    }
  }
});

test('each bundled binary is the exact upstream artifact recorded in the notices', async () => {
  const digests = [];
  for (const { url, family, weight, sha256 } of FACES) {
    const data = await fs.readFile(path.join(ROOT, 'public', url.slice(1)));
    assert.equal(data.subarray(0, 4).toString('latin1'), 'wOF2', `${family} ${weight}: not WOFF2`);
    const digest = createHash('sha256').update(data).digest('hex');
    // Pinned so a subset slice or a re-encoded container cannot be swapped in unnoticed. A
    // deliberate font update changes this digest and THIRD-PARTY-NOTICES.md in the same commit.
    assert.equal(
      digest,
      sha256,
      `${family} ${weight}: binary does not match the artifact in THIRD-PARTY-NOTICES.md`
    );
    digests.push(digest);
  }
  // Every bundled file is a distinct binary; byte-identical copies were the original defect.
  assert.equal(new Set(digests).size, FACES.length, 'bundled fonts contain duplicate binaries');
});

test('every page preloads the display font only, and partials add none', async () => {
  const fontPreloads = (content) => [...content.matchAll(/<link\b[^>]*\bas=["']font["'][^>]*>/gi)];
  for (const file of discoverHtml(ROOT)) {
    const links = fontPreloads(await fs.readFile(path.join(ROOT, file), 'utf8'));
    assert.deepEqual(
      links.map((link) => link[0].match(/\bhref=["']([^"']+)["']/i)?.[1]),
      PRELOADED,
      `${file}: unexpected font preload set`
    );
    for (const link of links) {
      assert.match(link[0], /\bcrossorigin\b/i, `${file}: font preload needs crossorigin`);
    }
  }
  // Every preloaded file must be one the stylesheet declares, or it is dead weight.
  const declared = new Set(FACES.map((face) => face.url));
  for (const url of PRELOADED) assert.ok(declared.has(url), `${url}: preloaded but not declared`);
  // Shared includes land in every page, so a preload there would duplicate the per-page one.
  for (const file of await fg('src/partials/**/*.html', { cwd: ROOT })) {
    const links = fontPreloads(await fs.readFile(path.join(ROOT, file), 'utf8'));
    assert.equal(links.length, 0, `${file}: shared partials must not preload fonts`);
  }
});
