import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import {
  findInlineStyleSinks,
  hashInlineScript,
  inspectInlineSources,
  validateCsp,
} from '../csp.mjs';
import { discoverHtml, renderHtml } from '../html.mjs';
import { voltGarage } from '../vite-volt-garage.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BODY = '\n  window.example = true;\n';
const HASH = hashInlineScript(BODY);
const PAGE = `<script>${BODY}</script>`;
const HEADERS = `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' ${HASH}; style-src 'self'\n`;
const check = (headers = HEADERS, page = PAGE) =>
  validateCsp(headers, new Map([['index.html', page]]));

// Feed all real rendered entries through the production hook. This exercises LF
// emission without writing dist/ or normalizing text in the hash validator.
test('all rendered entries pass CSP after production emission, including theme preload and JSON-LD', async () => {
  const bundle = {};
  for (const file of discoverHtml(ROOT)) {
    bundle[file] = {
      type: 'asset',
      fileName: file,
      source: await renderHtml(ROOT, file, await fs.readFile(path.join(ROOT, file), 'utf8')),
    };
  }
  await voltGarage(ROOT).generateBundle.handler.call({ emitFile() {} }, {}, bundle);
  const documents = new Map(Object.entries(bundle).map(([file, output]) => [file, output.source]));
  const headers = await fs.readFile(path.join(ROOT, 'public/_headers'), 'utf8');
  assert.deepEqual(await validateCsp(headers, documents), []);
  const bodies = new Set();
  const dataTypes = [];
  for (const [file, content] of documents) {
    const { scripts } = await inspectInlineSources(content, file);
    for (const script of scripts) {
      assert.ok(!script.body.includes('\r'), file);
      if (script.data) dataTypes.push(JSON.parse(script.body)['@type']);
      else bodies.add(script.body);
    }
    assert.match(content, /<head>[\s\S]*<script data-theme-preload>/);
  }
  assert.equal(bodies.size, 1, 'the currently intentional executable body is shared');
  assert.deepEqual(dataTypes.sort(), ['OnlineStore', 'WebSite']);
});

// The shipped policy is what the browser enforces, so assert its text, not only that it validates.
test('the shipped policy authorizes styles only as same-origin files', async () => {
  const headers = await fs.readFile(path.join(ROOT, 'public/_headers'), 'utf8');
  const directive = headers.match(/;\s*style-src([^;\r\n]*)/);
  assert.ok(directive, 'the global policy declares style-src');
  assert.deepEqual(directive[1].trim().split(/\s+/), ["'self'"]);
});

// The header shadow now lives in .site-header.shrink; no module may write an inline style again.
test('no runtime module writes an inline style, and the detector still catches one that does', async () => {
  const found = [];
  for (const file of fg.sync(['js/**/*.js', 'src/sw.js'], { cwd: ROOT })) {
    found.push(...findInlineStyleSinks(await fs.readFile(path.join(ROOT, file), 'utf8'), file));
  }
  assert.deepEqual(found, []);
  for (const sink of [
    "header.style.boxShadow = 'var(--shadow-sm)';",
    "header.style.setProperty('box-shadow', 'none');",
    "header.style.cssText = 'box-shadow: none';",
    'header.style = "box-shadow: none";',
    "header.setAttribute('style', 'box-shadow: none');",
    "document.body.appendChild(document.createElement('style'));",
  ]) {
    assert.equal(findInlineStyleSinks(sink, 'example.js').length, 1, sink);
  }
  // Reading a value, comparing one, or naming a request destination is not an inline style write.
  assert.deepEqual(
    findInlineStyleSinks(
      "if (el.style.width === width) return ['style'].includes(request.destination);",
      'example.js'
    ),
    []
  );
});

for (const [name, headers, expected] of [
  ['missing policy', '', /Content-Security-Policy/],
  ['non-global policy', HEADERS.replace('/*', '/index.html'), /global/],
  ['duplicate policy', HEADERS + HEADERS, /exactly one/],
  [
    'missing script-src',
    "/*\n  Content-Security-Policy: default-src 'self'",
    /missing CSP script-src/,
  ],
  ['missing self', HEADERS.replace("script-src 'self'", 'script-src'), /retain 'self'/],
  [
    'unsafe-inline restored',
    HEADERS.replace(HASH, `${HASH} 'unsafe-inline'`),
    /found 'unsafe-inline'/,
  ],
  ['unsafe-eval', HEADERS.replace(HASH, `${HASH} 'unsafe-eval'`), /found 'unsafe-eval'/],
  ['wildcard', HEADERS.replace(HASH, `${HASH} *`), /found \*/],
  ['hash removed', HEADERS.replace(HASH, ''), /no matching CSP hash/],
  ['incorrect hash', HEADERS.replace(HASH, hashInlineScript('wrong')), /no matching CSP hash/],
  ['malformed hash', HEADERS.replace(HASH, "'sha256-invalid'"), /found 'sha256-invalid'/],
  ['orphaned hash', HEADERS.replace(HASH, `${HASH} ${hashInlineScript('obsolete')}`), /orphaned/],
  [
    'duplicate directive',
    HEADERS.replace('; style-src', "; script-src 'self'; style-src"),
    /duplicate CSP directive/,
  ],
  [
    'script-src-elem override',
    HEADERS.replace('; style-src', "; script-src-elem 'unsafe-inline'; style-src"),
    /overrides/,
  ],
  [
    'script-src-attr override',
    HEADERS.replace('; style-src', "; script-src-attr 'unsafe-inline'; style-src"),
    /overrides/,
  ],
  ['missing style-src', HEADERS.replace("; style-src 'self'", ''), /missing CSP style-src/],
  [
    'style-src without self',
    HEADERS.replace("; style-src 'self'", '; style-src'),
    /style-src must retain 'self'/,
  ],
  [
    'style unsafe-inline restored',
    HEADERS.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
    /style-src permits only 'self', found 'unsafe-inline'/,
  ],
  [
    'style wildcard',
    HEADERS.replace("style-src 'self'", "style-src 'self' *"),
    /style-src permits only 'self', found \*/,
  ],
  [
    'remote style origin',
    HEADERS.replace("style-src 'self'", "style-src 'self' https://fonts.googleapis.com"),
    /style-src permits only 'self', found https:\/\/fonts\.googleapis\.com/,
  ],
  [
    'style hash allowance',
    HEADERS.replace("style-src 'self'", `style-src 'self' ${hashInlineScript('a{color:red}')}`),
    /style-src permits only 'self', found 'sha256-/,
  ],
  [
    'style-src-elem override',
    HEADERS.replace('; style-src', "; style-src-elem 'unsafe-inline'; style-src"),
    /overrides the style-src contract/,
  ],
  [
    'style-src-attr override',
    HEADERS.replace('; style-src', "; style-src-attr 'unsafe-inline'; style-src"),
    /overrides the style-src contract/,
  ],
]) {
  test(`CSP rejects ${name}`, async () => {
    assert.match((await check(headers)).join('\n'), expected);
  });
}

for (const [name, page, expected] of [
  ['one changed character', PAGE.replace('true', 'True'), /no matching CSP hash/],
  ['one added space', PAGE.replace('  window', '   window'), /no matching CSP hash/],
  ['changed newline', PAGE.replace('\n', '\r\n'), /no matching CSP hash/],
  [
    'new executable script',
    PAGE + '<script>window.unapproved = 1;</script>',
    /no matching CSP hash/,
  ],
  [
    'new inline module',
    PAGE + '<script type="module">export default 1;</script>',
    /no matching CSP hash/,
  ],
  ['inline event handler', PAGE + '<button onclick="alert(1)">x</button>', /attribute onclick/],
  ['unquoted mixed-case handler', PAGE + '<img src="/a.png" OnLoAd=alert(1)>', /attribute onload/],
  ['javascript URL', PAGE + '<a href="javascript:alert(1)">x</a>', /javascript: URL/],
  [
    'encoded javascript URL',
    PAGE + '<a href="java&#x73;cript&colon;alert(1)">x</a>',
    /javascript: URL/,
  ],
  ['control character URL', PAGE + '<a href="java&Tab;script:alert(1)">x</a>', /javascript: URL/],
  ['foreign handler', PAGE + '<svg><a onclick="alert(1)">x</a></svg>', /attribute onclick/],
  ['foreign script', PAGE + '<svg><script>alert(1)</script></svg>', /no matching CSP hash/],
  [
    'srcdoc',
    PAGE + '<iframe srcdoc="&lt;script>alert(1)&lt;/script>"></iframe>',
    /attribute srcdoc/,
  ],
  ['inline style attribute', PAGE + '<p style="color:red">x</p>', /inline style attribute/],
  [
    'unquoted mixed-case style attribute',
    PAGE + '<p StYlE=color:red>x</p>',
    /inline style attribute/,
  ],
  ['inline style element', PAGE + '<style>body{color:red}</style>', /inline <style> element/],
  [
    'foreign style attribute',
    PAGE + '<svg><rect style="fill:red"></rect></svg>',
    /inline style attribute/,
  ],
  [
    'foreign style element',
    PAGE + '<svg><style>rect{fill:red}</style></svg>',
    /inline <style> element/,
  ],
]) {
  test(`CSP rejects ${name}`, async () => {
    assert.match((await check(HEADERS, page)).join('\n'), expected);
  });
}

test('exact bodies pass; inert JSON, comments and quoted text do not create script permissions', async () => {
  const page =
    PAGE +
    '<script type="application/ld+json">{"@type":"WebSite"}</script>' +
    '<script type="application/json">{"text":"onclick=example"}</script>' +
    '<!-- <script>unapproved()</script><a onclick=x> -->' +
    '<p title="x > y; onclick=example">Text</p>';
  assert.deepEqual(await check(HEADERS, page), []);
  assert.deepEqual(await check(HEADERS.replace(/\n/g, '\r\n')), []);
});

test('CRLF body is rejected even with its byte hash, since browsers parse it as LF', async () => {
  const body = BODY.replace(/\n/g, '\r\n');
  assert.match(
    (await check(HEADERS.replace(HASH, hashInlineScript(body)), `<script>${body}</script>`)).join(
      '\n'
    ),
    /production LF/
  );
});

test('deliberately authorizing an additional exact body passes without a fixed hash count', async () => {
  const body = 'window.approved = true;';
  assert.deepEqual(
    await check(
      HEADERS.replace(HASH, `${HASH} ${hashInlineScript(body)}`),
      PAGE + `<script>${body}</script>`
    ),
    []
  );
});
