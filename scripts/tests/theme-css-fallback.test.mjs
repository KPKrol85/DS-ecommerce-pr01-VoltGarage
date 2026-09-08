import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const THEMES = 'css/partials/themes.css';
// The runtime writes data-theme onto <html>. The fallback exists for the case where it never
// runs, so it may only reach a root that carries no explicit choice.
const FALLBACK_SELECTOR = ':root:not([data-theme])';
const DARK_SELECTOR = "[data-theme='dark']";
const LIGHT_SELECTOR = "[data-theme='light']";
const DARK_MEDIA = '@media (prefers-color-scheme: dark)';
// A selector reaches the document root through :root or html, in any combinator position.
const ROOT_TARGETING = /(^|[\s,>+~])(:root|html)\b/;

const readCss = (file) => fs.readFile(path.join(ROOT, file), 'utf8');

// Split a stylesheet into { prelude, body } rules. Quotes are tracked so a url('…') cannot
// confuse the brace depth; a rule's body is re-parsed by calling this on it again.
function parseRules(css, label) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0;
  let quote = null;
  let preludeStart = 0;
  let blockStart = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      // A CSS string ends at its matching quote; no string in this project escapes one.
      if (character === quote) quote = null;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === '{') {
      depth += 1;
      if (depth === 1) blockStart = index;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        rules.push({
          prelude: source.slice(preludeStart, blockStart).replace(/\s+/g, ' ').trim(),
          body: source.slice(blockStart + 1, index),
        });
        preludeStart = index + 1;
      }
    }
  }
  assert.equal(depth, 0, `${label}: unbalanced braces`);
  return rules;
}

const selectorsOf = (prelude) =>
  prelude
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean);

// Custom-property values carry commas and parentheses but never a semicolon, so top-level
// semicolons delimit declarations and the first colon separates the name from the value.
function parseDeclarations(body, label) {
  assert.ok(!body.includes('{'), `${label}: expected a flat declaration block`);
  const declarations = new Map();
  for (const piece of body.split(';')) {
    const text = piece.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const separator = text.indexOf(':');
    assert.ok(separator > 0, `${label}: malformed declaration "${text}"`);
    declarations.set(text.slice(0, separator).trim(), text.slice(separator + 1).trim());
  }
  assert.ok(declarations.size > 0, `${label}: no declarations found`);
  return declarations;
}

function declarationsFor(rules, selector) {
  const matches = rules.filter((rule) => selectorsOf(rule.prelude).includes(selector));
  assert.equal(matches.length, 1, `${selector}: expected exactly one rule at this level`);
  return parseDeclarations(matches[0].body, selector);
}

const sortedEntries = (declarations) =>
  [...declarations].sort(([left], [right]) => left.localeCompare(right));

const topLevel = parseRules(await readCss(THEMES), THEMES);
const darkMedia = topLevel.filter(
  (rule) => rule.prelude.startsWith('@media') && rule.prelude.includes('prefers-color-scheme')
);

test('themes.css carries one dark-system fallback for documents without JavaScript', () => {
  assert.equal(darkMedia.length, 1, `${THEMES}: expected exactly one ${DARK_MEDIA} block`);
  assert.equal(darkMedia[0].prelude, DARK_MEDIA, `${THEMES}: unexpected media condition`);
});

test('the fallback reaches only a root that carries no explicit data-theme', () => {
  const rules = parseRules(darkMedia[0].body, DARK_MEDIA);
  assert.equal(rules.length, 1, `${DARK_MEDIA}: expected a single fallback rule`);
  assert.deepEqual(
    selectorsOf(rules[0].prelude),
    [FALLBACK_SELECTOR],
    `${DARK_MEDIA}: the fallback selector must stay guarded by :not([data-theme])`
  );
});

test('no dark media query repaints a root that an explicit theme owns', async () => {
  const files = fg.sync('css/**/*.css', { cwd: ROOT, onlyFiles: true }).sort();
  assert.ok(files.includes(THEMES), 'the stylesheet scan lost themes.css');
  for (const file of files) {
    for (const rule of parseRules(await readCss(file), file)) {
      if (!rule.prelude.startsWith('@media')) continue;
      if (!rule.prelude.includes('prefers-color-scheme')) continue;
      for (const nested of parseRules(rule.body, `${file} ${rule.prelude}`)) {
        for (const selector of selectorsOf(nested.prelude)) {
          if (!ROOT_TARGETING.test(selector)) continue;
          assert.ok(
            selector.includes(':not([data-theme])'),
            `${file}: "${selector}" under ${rule.prelude} would outrank an explicit theme`
          );
        }
      }
    }
  }
});

test('the explicit light and dark palettes stay outside any media query', () => {
  for (const selector of [LIGHT_SELECTOR, DARK_SELECTOR]) {
    const rules = topLevel.filter((rule) => selectorsOf(rule.prelude).includes(selector));
    assert.equal(rules.length, 1, `${selector}: an explicit theme must apply unconditionally`);
  }
});

test('the fallback palette is the explicit dark palette, declaration for declaration', () => {
  const explicit = declarationsFor(topLevel, DARK_SELECTOR);
  const fallback = declarationsFor(parseRules(darkMedia[0].body, DARK_MEDIA), FALLBACK_SELECTOR);
  assert.ok(explicit.size >= 15, `${DARK_SELECTOR}: the dark token set shrank unexpectedly`);
  assert.deepEqual(
    sortedEntries(fallback),
    sortedEntries(explicit),
    `the no-JavaScript fallback drifted from ${DARK_SELECTOR}`
  );
});

test('the fallback serves dark values rather than repeating the light palette', () => {
  const light = declarationsFor(topLevel, LIGHT_SELECTOR);
  const fallback = declarationsFor(parseRules(darkMedia[0].body, DARK_MEDIA), FALLBACK_SELECTOR);
  for (const token of ['--color-text', '--color-bg', '--color-surface', '--color-card']) {
    assert.ok(light.has(token), `${LIGHT_SELECTOR}: ${token} is no longer defined`);
    assert.notEqual(
      fallback.get(token),
      light.get(token),
      `${token}: the fallback still serves the light value`
    );
  }
});
