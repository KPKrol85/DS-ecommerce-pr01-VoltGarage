import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverHtml, renderHtml } from '../html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const documents = discoverHtml(ROOT);

test('the heading scan covers all 15 Vite HTML entries', () => {
  assert.equal(documents.length, 15);
});

for (const file of documents) {
  test(`${file}: rendered headings never skip a level`, async () => {
    const source = await fs.readFile(path.join(ROOT, file), 'utf8');
    // Use the same renderer as Vite so shared headings participate in document order.
    const html = (await renderHtml(ROOT, file, source))
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((match) => ({
      level: Number(match[1]),
      text: match[2]
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }));
    assert.equal(headings[0]?.level, 1, `${file}: the outline must start with h1`);
    assert.equal(headings.filter(({ level }) => level === 1).length, 1, `${file}: one page h1`);
    assert.ok(headings[0].text, `${file}: the page h1 must have meaningful text`);
    assert.match(html, /<footer\b/, `${file}: the shared footer must be rendered`);
    const skips = [];
    for (let index = 1; index < headings.length; index += 1) {
      const previous = headings[index - 1];
      const current = headings[index];
      if (current.level > previous.level + 1) {
        skips.push(
          `${file}: h${previous.level} "${previous.text}" -> h${current.level} "${current.text}" (jump +${current.level - previous.level})`
        );
      }
    }
    assert.deepEqual(skips, [], skips.join('\n'));
  });
}
