// Product rasters live under assets/images/, and tools/image-optimizer/optimize-images.mjs
// mirrors that tree into assets/images/_optimized/, keeping the relative path and swapping the
// extension. The rendered <picture> sources and scripts/validate-product-assets.mjs both derive
// their optimized paths here, so what a product renders and what QA checks cannot drift apart.
export const RASTER_ROOT = 'assets/images/';
const OPTIMIZED_ROOT = 'assets/images/_optimized/';
const RASTER_EXTENSION = /\.(jpe?g|png)$/i;

// A catalog image only has optimized variants when it is a raster inside the mirrored tree, and
// never when it already points at the optimizer output.
export const hasOptimizedVariants = (imagePath) =>
  typeof imagePath === 'string' &&
  imagePath.startsWith(RASTER_ROOT) &&
  !imagePath.startsWith(OPTIMIZED_ROOT) &&
  RASTER_EXTENSION.test(imagePath);

// Public asset paths relative to the site root, in the order the <picture> element declares them.
export const productImageVariants = (imagePath) => {
  const base = imagePath.replace(RASTER_ROOT, OPTIMIZED_ROOT).replace(RASTER_EXTENSION, '');
  return { avif: `${base}.avif`, webp: `${base}.webp` };
};
