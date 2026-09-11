import path from 'node:path';

export const PRODUCT_MASTER_ROOT = 'src/assets/images/products';
export const PRODUCT_RASTER_ROOT = 'public/assets/images/products';
export const PRODUCT_FALLBACK_SIZE = { width: 1080, height: 960 };

const relativeInside = (root, file) => {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : null;
};

// Public globs keep working, but a product fallback is never an encoding source.
// Masters discovered directly use the same virtual public path for variant output.
export function resolveImageSource(projectRoot, file) {
  const inputRoot = path.resolve(projectRoot, 'public/assets/images');
  const masterRoot = path.resolve(projectRoot, PRODUCT_MASTER_ROOT);
  const rasterRoot = path.resolve(projectRoot, PRODUCT_RASTER_ROOT);
  const absolute = path.resolve(projectRoot, file);
  const product = relativeInside(masterRoot, absolute) || relativeInside(rasterRoot, absolute);
  if (product) {
    return {
      inputPath: path.join(masterRoot, product),
      relativePath: path.join('products', product),
      outsideRoot: false,
    };
  }
  const relative = relativeInside(inputRoot, absolute);
  return {
    inputPath: absolute,
    relativePath: relative || path.basename(absolute),
    outsideRoot: !relative,
  };
}
