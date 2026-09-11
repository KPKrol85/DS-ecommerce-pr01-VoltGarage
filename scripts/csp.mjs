import { createHash } from 'node:crypto';
import { Config, Parser } from 'html-validate';

const SHA256_SOURCE = /^'sha256-[A-Za-z0-9+/]{43}='$/;
const DATA_TYPES = new Set(['application/ld+json', 'application/json']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);
// Runtime writes that would produce an inline style attribute or a generated <style> element,
// neither of which style-src 'self' authorizes. Presentation belongs in the stylesheet instead.
const INLINE_STYLE_SINKS = [
  [/\.style\s*\.\s*setProperty\s*\(/, 'style.setProperty() call'],
  [/\.style\s*\.\s*[A-Za-z_$][\w$]*\s*=(?!=)/, 'inline style property assignment'],
  [/\.style\s*=(?!=)/, 'inline style attribute assignment'],
  [/\.setAttribute\s*\(\s*(['"`])style\1/, "setAttribute('style') call"],
  [/\.createElement\s*\(\s*(['"`])style\1/, "createElement('style') call"],
];

export const hashInlineScript = (body) =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

// Bundled output is minified and carries Vite's own runtime, so this reads application sources.
export function findInlineStyleSinks(source, filename) {
  const errors = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const sink = INLINE_STYLE_SINKS.find(([pattern]) => pattern.test(line));
    if (sink) errors.push(`${filename}:${index + 1}: ${sink[1]} needs an inline style allowance`);
  });
  return errors;
}

// Decode the character references that can conceal a javascript: scheme. Script
// bodies never go through this function: their exact production text is hashed.
function executionUrl(value) {
  return value
    .replace(/&#(?:x([\da-f]+)|(\d+));?|&(Tab|NewLine|colon);/gi, (_, hex, dec, named) => {
      if (named) return { tab: '\t', newline: '\n', colon: ':' }[named.toLowerCase()];
      const code = Number.parseInt(hex || dec, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
    })
    // Control characters are exactly what conceals the scheme, so stripping them is the intent.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020]/g, '');
}

export async function inspectInlineSources(content, filename) {
  // Reuse the project's HTML parser, including quoted/unquoted attributes and
  // comments. Scan foreign descendants too (the linter normally skips them).
  const config = await Config.fromObject([], {
    elements: ['html5', { svg: { foreign: false }, math: { foreign: false } }],
  });
  const document = new Parser(await config.resolve()).parseHtml(content);
  const scripts = [];
  const errors = [];
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      const name = attribute.key.toLowerCase();
      if (/^on[a-z]+$/.test(name) || name === 'srcdoc') {
        errors.push(`${filename}: inline execution attribute ${name} is not allowed`);
      }
      if (name === 'style') {
        errors.push(`${filename}: inline style attribute is not allowed`);
      }
      if (
        URL_ATTRIBUTES.has(name) &&
        /^javascript:/i.test(executionUrl(String(attribute.value || '')))
      ) {
        errors.push(`${filename}: javascript: URL in ${name} is not allowed`);
      }
    }
    if (element.tagName === 'style') {
      errors.push(`${filename}: inline <style> element is not allowed`);
    }
    if (element.tagName !== 'script' || element.hasAttribute('src')) continue;
    const type = (element.getAttributeValue('type') || '').trim().toLowerCase();
    const body = element.textContent;
    // Only these inert JSON data blocks are exempt. Other types, including
    // modules/import maps/speculation rules, require explicit hash authorization.
    const data = DATA_TYPES.has(type);
    if (data) {
      try {
        JSON.parse(body);
      } catch {
        errors.push(`${filename}: invalid ${type} data block`);
      }
    }
    scripts.push({ type, body, data, hash: hashInlineScript(body) });
  }
  return { scripts, errors };
}

function policyDirectives(headers, errors) {
  let route;
  const policies = [];
  for (const line of headers.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\S/.test(line)) route = line.trim();
    const match = line.match(/^\s+Content-Security-Policy:\s*(.*?)\s*$/i);
    if (match) policies.push({ route, value: match[1] });
  }
  if (policies.length !== 1 || policies[0].route !== '/*') {
    errors.push('_headers: expected exactly one global /* Content-Security-Policy');
    return null;
  }
  const directives = new Map();
  for (const part of policies[0].value.split(';')) {
    if (!part.trim()) continue;
    const [rawName, ...values] = part.trim().split(/\s+/);
    const name = rawName.toLowerCase();
    if (!/^[a-z][a-z\d-]*$/.test(name) || directives.has(name)) {
      errors.push(`_headers: invalid or duplicate CSP directive ${name}`);
    }
    directives.set(name, values);
  }
  return directives;
}

function scriptSources(directives, errors) {
  for (const name of ['script-src-elem', 'script-src-attr']) {
    if (directives.has(name)) errors.push(`_headers: ${name} overrides the script-src contract`);
  }
  const sources = directives.get('script-src');
  if (!sources) errors.push('_headers: missing CSP script-src');
  if (!sources?.includes("'self'")) errors.push("_headers: script-src must retain 'self'");
  const hashes = new Set();
  for (const source of sources || []) {
    if (source === "'self'") continue;
    if (
      !SHA256_SOURCE.test(source) ||
      Buffer.from(source.slice(8, -1), 'base64').toString('base64') !== source.slice(8, -1)
    ) {
      errors.push(`_headers: script-src permits only 'self' and SHA-256 hashes, found ${source}`);
    } else {
      hashes.add(source);
    }
  }
  return hashes;
}

// Styles are authorized as same-origin files only: no inline allowance, hash, nonce or remote
// origin, so every declaration the browser applies is reviewable in the repository.
function styleSources(directives, errors) {
  for (const name of ['style-src-elem', 'style-src-attr']) {
    if (directives.has(name)) errors.push(`_headers: ${name} overrides the style-src contract`);
  }
  const sources = directives.get('style-src');
  if (!sources) errors.push('_headers: missing CSP style-src');
  if (!sources?.includes("'self'")) errors.push("_headers: style-src must retain 'self'");
  for (const source of sources || []) {
    if (source !== "'self'")
      errors.push(`_headers: style-src permits only 'self', found ${source}`);
  }
}

export async function validateCsp(headers, documents) {
  const errors = [];
  const directives = policyDirectives(headers, errors);
  const authorized = directives ? scriptSources(directives, errors) : new Set();
  if (directives) styleSources(directives, errors);
  const required = new Set();
  for (const [filename, content] of documents) {
    try {
      const inventory = await inspectInlineSources(content, filename);
      errors.push(...inventory.errors);
      for (const script of inventory.scripts) {
        if (script.data) continue;
        // HTML parsing converts CR/CRLF to LF. Production emits LF so the bytes
        // below also match the browser's text; do not normalize before hashing.
        if (script.body.includes('\r')) {
          errors.push(`${filename}: inline script must use production LF line endings`);
        }
        required.add(script.hash);
        if (!authorized.has(script.hash)) {
          errors.push(`${filename}: inline script has no matching CSP hash ${script.hash}`);
        }
      }
    } catch (error) {
      errors.push(`${filename}: CSP HTML inspection failed: ${error.message}`);
    }
  }
  for (const hash of authorized) {
    if (!required.has(hash)) errors.push(`_headers: orphaned script-src hash ${hash}`);
  }
  return errors;
}
