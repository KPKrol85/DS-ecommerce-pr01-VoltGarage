const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT_DIR = process.cwd();
const HTML_EXT = '.html';
const SKIP_DIRS = new Set(['node_modules', '.git']);
const JSON_LD_REGEX =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const PRODUCT_SCHEMA_SOURCE = 'js/features/products.js';
const PRODUCT_SCHEMA_REGEX = /['"]@type['"]\s*:\s*['"]Product['"]/;
const SEARCH_ACTION_REGEX = /['"]@type['"]\s*:\s*['"]SearchAction['"]/;
const ORGANIZATION_REGEX = /['"]@type['"]\s*:\s*['"]Organization['"]/;

const TEMPLATE_RULES = [
  {
    key: 'home',
    paths: ['index.html'],
    requiredTypes: ['OnlineStore', 'WebSite'],
    disallowedTypes: ['Product', 'BreadcrumbList', 'ItemList'],
  },
  {
    key: 'product',
    paths: ['pages/product.html'],
    disallowedTypes: [
      'Product',
      'BreadcrumbList',
      'ItemList',
      'OnlineStore',
      'WebSite',
      'Organization',
    ],
    requireRuntimeProductSchema: true,
  },
];

async function collectHtmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...(await collectHtmlFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(HTML_EXT)) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeType(type) {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed) return null;
  return trimmed.includes(':') ? trimmed.split(':').pop() : trimmed;
}

function collectJsonLdTypes(jsonNode, collectedTypes) {
  if (!jsonNode || typeof jsonNode !== 'object') return;

  if (Array.isArray(jsonNode)) {
    for (const item of jsonNode) {
      collectJsonLdTypes(item, collectedTypes);
    }
    return;
  }

  const typeValue = jsonNode['@type'];
  const typeValues = Array.isArray(typeValue) ? typeValue : [typeValue];
  for (const rawType of typeValues) {
    const normalizedType = normalizeType(rawType);
    if (normalizedType) {
      collectedTypes.add(normalizedType);
    }
  }

  for (const value of Object.values(jsonNode)) {
    if (value && typeof value === 'object') {
      collectJsonLdTypes(value, collectedTypes);
    }
  }
}

function getTemplateRule(filePath) {
  return TEMPLATE_RULES.find((rule) => rule.paths.includes(filePath));
}

function validateJsonLdBlocks(filePath, content) {
  const errors = [];
  const types = new Set();
  let match;
  let blockIndex = 0;

  JSON_LD_REGEX.lastIndex = 0;

  while ((match = JSON_LD_REGEX.exec(content)) !== null) {
    blockIndex += 1;
    const jsonText = match[1].trim();

    if (!jsonText) {
      errors.push(`${filePath} [block ${blockIndex}]: empty JSON-LD block.`);
      continue;
    }

    try {
      const parsed = JSON.parse(jsonText);
      collectJsonLdTypes(parsed, types);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      errors.push(`${filePath} [block ${blockIndex}]: invalid JSON-LD syntax (${details}).`);
    }
  }

  return { errors, types };
}

function validateTemplateExpectations(filePath, types, rule) {
  if (!rule) return [];

  const errors = [];

  for (const requiredType of rule.requiredTypes || []) {
    if (!types.has(requiredType)) {
      errors.push(
        `${filePath}: template "${rule.key}" expected schema type "${requiredType}" but found [${
          [...types].join(', ') || 'none'
        }].`
      );
    }
  }

  for (const disallowedType of rule.disallowedTypes || []) {
    if (types.has(disallowedType)) {
      errors.push(
        `${filePath}: template "${rule.key}" does not allow schema type "${disallowedType}" in static HTML JSON-LD.`
      );
    }
  }

  return errors;
}

async function validateRuntimeProductSchema() {
  const productScriptPath = path.join(ROOT_DIR, PRODUCT_SCHEMA_SOURCE);
  const scriptContent = await fs.readFile(productScriptPath, 'utf8');
  const errors = [];

  if (!PRODUCT_SCHEMA_REGEX.test(scriptContent)) {
    errors.push(
      `pages/product.html: template "product" expects runtime Product JSON-LD in ${PRODUCT_SCHEMA_SOURCE}, but "@type: Product" was not found.`
    );
  }

  if (SEARCH_ACTION_REGEX.test(scriptContent)) {
    errors.push(`${PRODUCT_SCHEMA_SOURCE}: runtime schema must not include SearchAction.`);
  }

  if (ORGANIZATION_REGEX.test(scriptContent)) {
    errors.push(`${PRODUCT_SCHEMA_SOURCE}: runtime schema must not include Organization.`);
  }

  return errors;
}

async function main() {
  const htmlFiles = await collectHtmlFiles(ROOT_DIR);
  const errors = [];
  let checkedTemplateCount = 0;

  for (const filePath of htmlFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const relPath = path.relative(ROOT_DIR, filePath);

    const { errors: blockErrors, types } = validateJsonLdBlocks(relPath, content);
    errors.push(...blockErrors);

    if (SEARCH_ACTION_REGEX.test(content)) {
      errors.push(`${relPath}: static JSON-LD must not include SearchAction.`);
    }

    const templateRule = getTemplateRule(relPath);
    if (templateRule) {
      checkedTemplateCount += 1;
      errors.push(...validateTemplateExpectations(relPath, types, templateRule));
    }
  }

  errors.push(...(await validateRuntimeProductSchema()));

  if (errors.length > 0) {
    console.error('JSON-LD validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `JSON-LD validation passed for ${htmlFiles.length} HTML files, including ${checkedTemplateCount} template-specific assertions.`
  );
}

main().catch((error) => {
  console.error('Unable to run JSON-LD validation.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
