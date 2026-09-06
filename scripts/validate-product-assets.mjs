import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG = 'data/products.json';
const OPTIMIZED_PRODUCTS = 'assets/images/_optimized/products';
// js/features/products.js renders one AVIF and one WebP <source> per product picture.
const VARIANTS = ['avif', 'webp'];

// Catalog asset paths are public URL paths stored without a leading slash: the runtime only
// prefixes them with the document depth, so anything else breaks before it reaches the network.
const isPublicAssetPath = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.trim() === value &&
  !value.startsWith('/') &&
  !value.includes('\\') &&
  !/^[a-z][a-z\d+.-]*:/i.test(value) &&
  !value.split('/').includes('..');

// imageBase is interpolated into a fixed optimized directory, so it must be a bare file base.
const isFileBaseName = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.trim() === value &&
  !value.includes('/') &&
  !value.includes('\\') &&
  value !== '.' &&
  value !== '..';

async function validateProductAssets(root) {
  const publicDir = path.join(root, 'public');
  const errors = [];
  // Directory listings keep existence checks case-exact, matching the Linux host rather than
  // the case-insensitive filesystem a contributor may be editing on.
  const listings = new Map();
  const exists = async (assetPath) => {
    const directory = path.posix.dirname(assetPath);
    if (!listings.has(directory)) {
      listings.set(
        directory,
        fs
          .readdir(path.join(publicDir, directory), { withFileTypes: true })
          .then((entries) => new Set(entries.filter((e) => e.isFile()).map((e) => e.name)))
          .catch(() => new Set())
      );
    }
    return (await listings.get(directory)).has(path.posix.basename(assetPath));
  };

  let catalog;
  try {
    catalog = JSON.parse(await fs.readFile(path.join(publicDir, CATALOG), 'utf8'));
  } catch (error) {
    throw new Error(
      `Product asset validation failed:\n- public/${CATALOG}: unreadable catalog (${error.message})`
    );
  }
  if (!Array.isArray(catalog)) {
    throw new Error(
      `Product asset validation failed:\n- public/${CATALOG}: expected an array of products`
    );
  }

  let rasters = 0;
  let variants = 0;
  for (const [index, product] of catalog.entries()) {
    const entry = `entry #${index}`;
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      errors.push(`${entry}: catalog entry is not an object`);
      continue;
    }
    const hasId = typeof product.id === 'string' && product.id.trim().length > 0;
    const label = hasId ? `${product.id} (${entry})` : entry;
    if (!hasId) errors.push(`${entry}: missing product id`);

    if (!isPublicAssetPath(product.image)) {
      errors.push(
        `${label}: "image" must be a public asset path without a leading slash, received ${JSON.stringify(product.image)}`
      );
    } else if (await exists(product.image)) {
      rasters += 1;
    } else {
      errors.push(`${label}: missing raster image public/${product.image} (declared by "image")`);
    }

    if (product.imageBase === undefined) continue;
    if (!isFileBaseName(product.imageBase)) {
      errors.push(
        `${label}: "imageBase" must be a bare file base name, received ${JSON.stringify(product.imageBase)}`
      );
      continue;
    }
    for (const variant of VARIANTS) {
      const assetPath = `${OPTIMIZED_PRODUCTS}/${product.imageBase}.${variant}`;
      if (await exists(assetPath)) {
        variants += 1;
      } else {
        errors.push(
          `${label}: missing ${variant} variant public/${assetPath} (derived from "imageBase": ${JSON.stringify(product.imageBase)})`
        );
      }
    }
  }

  if (errors.length) throw new Error(`Product asset validation failed:\n- ${errors.join('\n- ')}`);
  console.log(
    `Product asset validation passed: ${catalog.length} catalog entries, ${rasters} raster images, ${variants} optimized variants.`
  );
}

export { validateProductAssets };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateProductAssets(process.cwd()).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
