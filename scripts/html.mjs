import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

const HTML_PATTERNS = ['*.html', 'pages/**/*.html'];
// The Netlify catch-all serves 404.html, and the worker serves offline.html, at the URL whose
// navigation failed. Their links must resolve from the site root, not the browser's directory.
const FALLBACK_DOCUMENTS = new Set(['404.html', 'offline.html']);
const INCLUDE_REGEX = /<!--\s*@include\s+(.+?)\s*-->/g;
const TEMPLATE_REGEX = /{{([\s\S]*?)}}/g;

const discoverHtml = (root) => fg.sync(HTML_PATTERNS, { cwd: root, onlyFiles: true }).sort();

function assertNoTemplateArtifacts(content, filename) {
  if (/@include|{{|}}/.test(content)) {
    throw new Error(`${filename}: unresolved HTML template artifact.`);
  }
}

function getTemplateContext(filename) {
  const normalized = filename.replaceAll('\\', '/');
  const directory = path.posix.dirname(normalized);
  const isFallbackDocument = FALLBACK_DOCUMENTS.has(normalized);
  const prefix = (target) => {
    if (isFallbackDocument) return target === '.' ? '/' : `/${target}/`;
    const relative = path.posix.relative(directory, target);
    return relative ? `${relative}/` : '';
  };
  return {
    isHomePage: normalized === 'index.html',
    isPagesDir: normalized.startsWith('pages/'),
    rootPrefix: prefix('.'),
    pagesPrefix: prefix('pages'),
  };
}

// Keep the existing include/context contract, and validate both conditional branches.
function renderTemplate(content, context) {
  const stack = [];
  let active = true;
  let offset = 0;
  let result = '';
  const valueFor = (key) => {
    if (!Object.hasOwn(context, key)) throw new Error(`Unknown template token "${key}".`);
    return context[key];
  };
  for (const match of content.matchAll(TEMPLATE_REGEX)) {
    if (active) result += content.slice(offset, match.index);
    const token = match[1];
    if (/^#if\s+[a-zA-Z0-9_]+$/.test(token)) {
      const condition = Boolean(valueFor(token.replace(/^#if\s+/, '')));
      stack.push({ parent: active, condition, hasElse: false });
      active = active && condition;
    } else if (token === 'else') {
      const frame = stack.at(-1);
      if (!frame || frame.hasElse) throw new Error('Unexpected {{else}}.');
      frame.hasElse = true;
      active = frame.parent && !frame.condition;
    } else if (token === '/if') {
      const frame = stack.pop();
      if (!frame) throw new Error('Unexpected {{/if}}.');
      active = frame.parent;
    } else {
      const value = valueFor(token);
      if (active) result += String(value);
    }
    offset = match.index + match[0].length;
  }
  if (stack.length) throw new Error('Unclosed {{#if}}.');
  result += content.slice(offset);
  return result;
}

async function renderHtml(root, filename, content) {
  const partialsRoot = await fs.realpath(path.join(root, 'src/partials'));
  async function resolveIncludes(source, sourceDir, parents = []) {
    let rendered = '';
    let offset = 0;
    for (const match of source.matchAll(INCLUDE_REGEX)) {
      const target = match[1].trim().replaceAll('\\', '/');
      const absolute = path.resolve(target.startsWith('src/') ? root : sourceDir, target);
      const includePath = await fs.realpath(absolute);
      const relative = path.relative(partialsRoot, includePath);
      if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        path.extname(includePath) !== '.html'
      ) {
        throw new Error(`Invalid include path "${target}": expected an HTML file in src/partials.`);
      }
      if (parents.includes(includePath)) throw new Error(`Circular include: ${target}.`);
      const partial = await fs.readFile(includePath, 'utf8');
      rendered += source.slice(offset, match.index);
      rendered += await resolveIncludes(partial, path.dirname(includePath), [
        ...parents,
        includePath,
      ]);
      offset = match.index + match[0].length;
    }
    return rendered + source.slice(offset);
  }
  try {
    const included = await resolveIncludes(content, path.dirname(path.join(root, filename)));
    const rendered = renderTemplate(included, getTemplateContext(filename));
    assertNoTemplateArtifacts(rendered, filename);
    return rendered;
  } catch (error) {
    throw new Error(`${filename}: ${error.message}`, { cause: error });
  }
}

export { HTML_PATTERNS, discoverHtml, renderHtml, assertNoTemplateArtifacts };
