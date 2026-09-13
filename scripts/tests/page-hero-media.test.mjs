import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverHtml, renderHtml } from '../html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// One placeholder stands in for every subpage until the page-specific artwork lands. Tomorrow's
// work changes each page's src and adds files here; the layout contract below does not move.
const PLACEHOLDER_DIR = 'assets/images/page-hero';
const PLACEHOLDER = `/${PLACEHOLDER_DIR}/page-hero-placeholder.svg`;
const HERO = /<section class="page-hero[^"]*">[\s\S]*?<\/section>/g;
const RETIRED = ['page-hero-mark', 'page-hero-mark-in', 'logo-badge-outline.svg'];

const attribute = (tag, name) =>
  tag.match(new RegExp(String.raw`\s${name}="([^"]*)"`))?.[1] ?? null;
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
  const [, width, height] = placeholder.match(/viewBox="0 0 (\d+) (\d+)"/);
  for (const { file, markup } of heroes) {
    const image = markup.match(/<img\b[\s\S]*?\/?>/)[0];
    assert.equal(attribute(image, 'width'), width, `${file}: hero image width attribute`);
    assert.equal(attribute(image, 'height'), height, `${file}: hero image height attribute`);
    assert.equal(attribute(image, 'decoding'), 'async', `${file}: hero image decoding`);
    // The hero sits at the top of the document; deferring it would only delay what is on screen.
    assert.notEqual(attribute(image, 'loading'), 'lazy', `${file}: the hero image is not lazy`);
  }
});

test('this phase ships one shared placeholder, and every hero points at it', async () => {
  const entries = await fs.readdir(path.join(ROOT, 'public', PLACEHOLDER_DIR), {
    withFileTypes: true,
  });
  assert.deepEqual(
    entries.map((entry) => entry.name),
    [path.posix.basename(PLACEHOLDER)],
    'the placeholder phase publishes exactly one shared file'
  );
  assert.ok(entries[0].isFile());
  for (const { file, markup } of heroes) {
    const image = markup.match(/<img\b[\s\S]*?\/?>/)[0];
    assert.equal(attribute(image, 'src'), PLACEHOLDER, `${file}: hero image source`);
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
