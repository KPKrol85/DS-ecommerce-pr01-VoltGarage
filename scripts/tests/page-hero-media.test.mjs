import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { discoverHtml, renderHtml } from '../html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Shop and collections have swapped the shared placeholder for artwork of their own. Both halves
// of that split are asserted here so neither drifts: a page that has its family keeps every
// candidate it publishes, and the pages still waiting keep pointing at the one placeholder.
const FALLBACK_DIR = 'assets/images/page-hero';
const VARIANT_DIR = 'assets/images/_optimized/page-hero';
const PLACEHOLDER = `/${FALLBACK_DIR}/page-hero-placeholder.svg`;
// The stem is the artwork's name rather than the route's — collections carries the category
// artwork — so the pairing is declared here instead of being derived from the page name.
// Each master stays in src/ as encoding input. Nothing may copy one into public/ and no document
// may name it: two megabytes of PNG is not something a browser should ever be offered.
const ARTWORK = [
  {
    file: 'pages/shop.html',
    stem: 'shop-hero',
    master: 'src/assets/images/page-hero/shop-hero.png',
  },
  {
    file: 'pages/collections.html',
    stem: 'category-hero',
    master: 'src/assets/images/page-hero/category-hero.png',
  },
];
const VARIANTS = [
  ['640x400', 640, 400],
  ['1280x800', 1280, 800],
];
// .page-hero-media renders at min(100%, clamp(200px, 32vw, 360px)) inside a 16 / 10 frame: the
// clamp floor holds until 32vw passes 200px at 625px, and 32vw holds until it meets the 360px
// ceiling at 1125px. The frame is never close to the viewport width, so a 100vw sizes would
// hand a phone the 1280w file for a 200px box.
const SIZES = '(min-width: 1125px) 360px, (min-width: 625px) 32vw, 200px';
const HERO = /<section class="page-hero[^"]*">[\s\S]*?<\/section>/g;
const RETIRED = ['page-hero-mark', 'page-hero-mark-in', 'logo-badge-outline.svg'];

const attribute = (tag, name) =>
  tag.match(new RegExp(String.raw`\s${name}="([^"]*)"`))?.[1] ?? null;
// srcset is written across lines and column-aligned; compare the candidates, not the whitespace.
const candidates = (value) =>
  (value ?? '')
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/))
    .filter(([url]) => url);
const variantUrl = (stem, size, extension) =>
  extension === 'jpg'
    ? `/${FALLBACK_DIR}/${stem}-${size}.jpg`
    : `/${VARIANT_DIR}/${stem}-${size}.${extension}`;
const expectedSrcset = (stem, extension) =>
  VARIANTS.map(([size, width]) => [variantUrl(stem, size, extension), `${width}w`]);

const pagesCss = await fs.readFile(path.join(ROOT, 'css/partials/pages.css'), 'utf8');
const themesCss = await fs.readFile(path.join(ROOT, 'css/partials/themes.css'), 'utf8');
const placeholder = await fs.readFile(path.join(ROOT, 'public', PLACEHOLDER.slice(1)), 'utf8');

const documents = await Promise.all(
  discoverHtml(ROOT).map(async (file) => [
    file,
    await renderHtml(ROOT, file, await fs.readFile(path.join(ROOT, file), 'utf8')),
  ])
);
const heroes = documents.flatMap(([file, content]) =>
  [...content.matchAll(HERO)].map(([markup]) => ({ file, markup }))
);
const artworkFiles = new Set(ARTWORK.map(({ file }) => file));
const placeholderHeroes = heroes.filter(({ file }) => !artworkFiles.has(file));

test('every shared hero pairs a copy column with the reusable media slot', () => {
  assert.ok(heroes.length >= 9, `expected the shared hero on more pages, found ${heroes.length}`);
  for (const { file, markup } of heroes) {
    assert.match(markup, /<div class="page-hero-copy">/, `${file}: the hero lost its copy column`);
    assert.match(markup, /<h1\b/, `${file}: the hero must keep its own h1`);
    assert.equal(
      (markup.match(/<div class="page-hero-media">/g) ?? []).length,
      1,
      `${file}: expected exactly one hero media slot`
    );
    const images = markup.match(/<img\b[\s\S]*?\/?>/g) ?? [];
    assert.equal(images.length, 1, `${file}: the hero carries exactly one image`);
    assert.match(images[0], /\sclass="page-hero-image"/, `${file}: the hero image needs its class`);
    // The reveal observer owns the page's scroll-in transitions. The hero entrance is the CSS
    // animation alone, so the two never run against each other on the same element.
    assert.doesNotMatch(markup, /\sdata-reveal\b/, `${file}: the hero must not also reveal`);
  }
});

test('the hero image is decorative and never repeats the heading it sits beside', () => {
  for (const { file, markup } of heroes) {
    const image = markup.match(/<img\b[\s\S]*?\/?>/)[0];
    assert.equal(attribute(image, 'alt'), '', `${file}: hero artwork is decorative`);
    assert.doesNotMatch(image, /\saria-label=/, `${file}: alt="" already leaves the a11y tree`);
    const heading = markup
      .match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]
      .replace(/<[^>]*>/g, '')
      .trim();
    assert.ok(heading.length > 0 && !image.includes(heading), `${file}: alt duplicates the h1`);
  }
});

test('the hero image reserves its box from intrinsic dimensions, so nothing shifts in', () => {
  // Placeholder and artwork reserve the same 640 x 400 box, so a page swapping its own source
  // in cannot move the copy beside it.
  const [, width, height] = placeholder.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.deepEqual([Number(width), Number(height)], VARIANTS[0].slice(1));
  for (const { file, markup } of heroes) {
    const image = markup.match(/<img\b[\s\S]*?\/?>/)[0];
    assert.equal(attribute(image, 'width'), width, `${file}: hero image width attribute`);
    assert.equal(attribute(image, 'height'), height, `${file}: hero image height attribute`);
    assert.equal(attribute(image, 'decoding'), 'async', `${file}: hero image decoding`);
    // The hero sits at the top of the document; deferring it would only delay what is on screen.
    assert.notEqual(attribute(image, 'loading'), 'lazy', `${file}: the hero image is not lazy`);
  }
});

test('artwork pages negotiate: AVIF, then WebP, then the JPEG every browser reads', () => {
  for (const { file, stem } of ARTWORK) {
    const hero = heroes.find((candidate) => candidate.file === file);
    assert.ok(hero, `${file}: expected the shared hero`);
    const media = hero.markup.match(/<div class="page-hero-media">([\s\S]*?)<\/div>/)[1];
    assert.equal(
      (media.match(/<picture>/g) ?? []).length,
      1,
      `${file}: the media slot holds exactly one picture`
    );
    const sources = media.match(/<source\b[\s\S]*?\/?>/g) ?? [];
    assert.deepEqual(
      sources.map((source) => attribute(source, 'type')),
      ['image/avif', 'image/webp'],
      `${file}: AVIF is offered first, WebP second`
    );
    for (const [source, extension] of [
      [sources[0], 'avif'],
      [sources[1], 'webp'],
    ]) {
      assert.deepEqual(
        candidates(attribute(source, 'srcset')),
        expectedSrcset(stem, extension),
        `${file}: ${extension} candidates`
      );
    }
    const image = media.match(/<img\b[\s\S]*?\/?>/)[0];
    // The img closes the picture: it is the fallback, so no source may follow it.
    assert.match(media, /<img\b[\s\S]*?\/?>\s*<\/picture>/, `${file}: the img closes the picture`);
    assert.match(
      image,
      /\sclass="page-hero-image"/,
      `${file}: the fallback keeps the shared class`
    );
    assert.equal(
      attribute(image, 'src'),
      variantUrl(stem, '640x400', 'jpg'),
      `${file}: fallback src`
    );
    assert.deepEqual(
      candidates(attribute(image, 'srcset')),
      expectedSrcset(stem, 'jpg'),
      `${file}: jpeg`
    );
    assert.equal(attribute(image, 'loading'), 'eager', `${file}: the hero is above the fold`);
    // One sizes value across all three candidate lists: a browser that falls back must not also
    // be told a different box to pick its width against.
    for (const tag of [...sources, image]) {
      assert.equal(
        attribute(tag, 'sizes'),
        SIZES,
        `${file}: every candidate list shares one sizes`
      );
    }
    // Each page names its own artwork: a copy-paste that left the previous page's stem behind
    // would otherwise satisfy every structural assertion above.
    for (const { stem: other } of ARTWORK) {
      if (other !== stem) assert.ok(!media.includes(other), `${file}: names ${other} artwork`);
    }
  }
  // 360px is the widest the frame ever renders, so an ordinary display takes the 640w file and
  // only a denser screen reaches for 1280w. A 1280w-only picture would hand every phone the big
  // one; a 640w-only picture would leave a retina hero soft.
  assert.ok(VARIANTS[0][1] >= 360, 'the small candidate covers the frame at DPR 1');
  assert.ok(VARIANTS[1][1] >= 360 * 2, 'the large candidate covers the frame at DPR 2');
});

test('the pages still waiting for artwork keep pointing at the one shared placeholder', () => {
  // Every hero is one of the two states; nothing may sit between them.
  assert.equal(
    placeholderHeroes.length,
    heroes.length - ARTWORK.length,
    'each hero is either migrated artwork or the shared placeholder'
  );
  assert.ok(placeholderHeroes.length >= 7, 'the placeholder phase still covers the other pages');
  for (const { file, markup } of placeholderHeroes) {
    assert.doesNotMatch(markup, /<picture\b/, `${file}: still on the placeholder, so no picture`);
    assert.doesNotMatch(markup, /\ssrcset=/, `${file}: the placeholder has no responsive family`);
    const image = markup.match(/<img\b[\s\S]*?\/?>/)[0];
    assert.equal(attribute(image, 'src'), PLACEHOLDER, `${file}: hero image source`);
  }
});

// public-asset-inventory owns the other half of this: which files the two page-hero directories
// are allowed to publish at all. Here the question is the reverse one — that every URL the heroes
// name, artwork and placeholder alike, is one of them.
test('every source the heroes name resolves to a published file', async () => {
  const named = heroes.flatMap(({ file, markup }) => {
    const urls = [...markup.matchAll(/\s(?:src|srcset)="([^"]*)"/g)].flatMap(([, value]) =>
      candidates(value).map(([url]) => url)
    );
    return urls.map((url) => [file, url]);
  });
  assert.ok(named.length >= heroes.length, 'every hero names at least one source');
  for (const [file, url] of named) {
    assert.ok(
      [FALLBACK_DIR, VARIANT_DIR].some((directory) => url.startsWith(`/${directory}/`)),
      `${file}: ${url} sits outside the hero asset directories`
    );
    assert.ok(
      (await fs.stat(path.join(ROOT, 'public', url.slice(1)))).isFile(),
      `${file}: ${url} is not published`
    );
  }
});

test('every published variant is the format and the 16 / 10 size its name claims', async () => {
  for (const { stem } of ARTWORK) {
    for (const [size, width, height] of VARIANTS) {
      for (const [extension, format] of [
        ['avif', 'heif'],
        ['webp', 'webp'],
        ['jpg', 'jpeg'],
      ]) {
        const url = variantUrl(stem, size, extension);
        const metadata = await sharp(path.join(ROOT, 'public', url.slice(1))).metadata();
        assert.equal(metadata.format, format, `${url}: encoded format`);
        if (extension === 'avif') assert.equal(metadata.compression, 'av1', `${url}: AVIF codec`);
        assert.deepEqual([metadata.width, metadata.height], [width, height], `${url}: dimensions`);
        // The frame is 16 / 10 and the image is object-fit: contain, so a variant off the ratio
        // would letterbox itself inside the hero rather than fill it.
        assert.equal(metadata.width / metadata.height, 16 / 10, `${url}: aspect ratio`);
      }
    }
  }
});

test('the retained PNG masters stay encoding sources and never reach a browser', async () => {
  for (const { master } of ARTWORK) {
    assert.ok(
      (await fs.stat(path.join(ROOT, master))).isFile(),
      `${master}: the master is retained`
    );
    await assert.rejects(
      fs.lstat(path.join(ROOT, 'public', master.replace(/^src\//, ''))),
      { code: 'ENOENT' },
      `${master}: the master must not be copied into public/`
    );
  }
  for (const [file, content] of documents) {
    for (const { master } of ARTWORK) {
      assert.ok(!content.includes(path.posix.basename(master)), `${file}: names the master`);
    }
    assert.ok(!content.includes('/src/assets/'), `${file}: reaches into the source tree`);
  }
});

test('the retired logo watermark is gone from the markup and the stylesheets', () => {
  for (const [file, content] of documents) {
    for (const token of RETIRED) {
      assert.ok(!content.includes(token), `${file}: still references the retired ${token}`);
    }
  }
  for (const [file, css] of [
    ['pages.css', pagesCss],
    ['themes.css', themesCss],
  ]) {
    for (const token of [...RETIRED, '--page-hero-mark-opacity', '--logo-mark-size']) {
      assert.ok(!css.includes(token), `${file}: still declares the retired ${token}`);
    }
  }
});

test('the media slot is shared CSS: one frame, one entrance, honoured under reduced motion', () => {
  // A page tuning its own artwork changes object-position, not the layout, so the frame and its
  // breakpoint stay in the shared stylesheet rather than turning into per-page hero rules.
  assert.match(pagesCss, /\.page-hero-media \{[^}]*aspect-ratio: 16 \/ 10;/);
  assert.match(pagesCss, /\.page-hero-image \{[^}]*object-fit: contain;/);
  assert.match(pagesCss, /\.page-hero-image \{[^}]*animation: page-hero-media-in /);
  assert.match(pagesCss, /@keyframes page-hero-media-in \{/);
  assert.doesNotMatch(pagesCss, /\.page--[\w-]+ \.page-hero-(media|image)\b/, 'no per-page hero');
  const reduced = pagesCss.match(
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.page-hero-image \{([^}]*)\}/
  );
  assert.ok(reduced, 'reduced motion must address the hero image');
  // animation: none returns the image to its own end state — visible and untransformed — rather
  // than stranding it at the opacity the keyframes open on.
  assert.match(reduced[1], /animation: none;/);
  assert.doesNotMatch(reduced[1], /opacity: 0/);
});

test('the artwork plate is keyed off <picture>, so a placeholder page stays undressed', () => {
  // The scoping is the contract, not the styling: the rounded, bordered, shadowed plate belongs
  // to finished artwork, and a page still holding the bare placeholder <img> must not inherit it.
  // Moving these declarations onto .page-hero-image would quietly frame eight placeholders.
  const plate = pagesCss.match(/\.page-hero-media picture \.page-hero-image \{([^}]*)\}/);
  assert.ok(plate, 'the artwork treatment must hang off the picture, not the shared image rule');
  for (const property of ['border', 'border-radius', 'box-shadow']) {
    assert.match(
      plate[1],
      new RegExp(String.raw`\s${property}:`),
      `the plate declares ${property}`
    );
  }
  // Tokens, not literals, so the plate follows the theme the rest of the surface already uses.
  assert.match(plate[1], /var\(--radius-[\w-]+\)/, 'radius comes from the scale');
  assert.match(plate[1], /var\(--shadow-[\w-]+\)/, 'shadow comes from the scale');
  assert.match(plate[1], /var\(--color-border\)/, 'the edge follows the border token');
  // The entrance owns transform and opacity alone; the plate must not animate or transition.
  assert.doesNotMatch(plate[1], /\s(?:animation|transition|transform):/, 'the plate is static');
  const shared = pagesCss.match(/\n\.page-hero-image \{([^}]*)\}/);
  assert.ok(shared, 'the shared image rule must still exist');
  for (const property of ['border', 'border-radius', 'box-shadow']) {
    assert.doesNotMatch(shared[1], new RegExp(String.raw`\s${property}:`), `${property} is scoped`);
  }
});

test('the sizes contract still describes the width the stylesheet actually renders', () => {
  // sizes is derived from these two declarations, so this is the assertion that fails first if
  // the frame is ever retuned. A picture whose sizes outruns its box downloads the wrong file.
  assert.match(pagesCss, /--page-hero-media-width: clamp\(200px, 32vw, 360px\);/);
  assert.match(
    pagesCss,
    /\.page-hero-media \{[^}]*width: min\(100%, var\(--page-hero-media-width\)\);/
  );
  // The breakpoints in sizes are where the clamp changes hands: 200px / 0.32 and 360px / 0.32.
  assert.equal(
    SIZES,
    `(min-width: ${360 / 0.32}px) 360px, (min-width: ${200 / 0.32}px) 32vw, 200px`
  );
});
