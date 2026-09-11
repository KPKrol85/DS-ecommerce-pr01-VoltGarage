import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PRODUCT_FALLBACK_SIZE, resolveImageSource } from './product-sources.mjs';

export function renderProductFallback(inputPath) {
  const image = sharp(inputPath).resize({
    ...PRODUCT_FALLBACK_SIZE,
    fit: 'inside',
    withoutEnlargement: true,
    kernel: 'lanczos3',
  });
  return path.extname(inputPath).toLowerCase() === '.png'
    ? image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer()
    : image.jpeg({ quality: 82, chromaSubsampling: '4:2:0', mozjpeg: true }).toBuffer();
}

export async function resizeProductFallbacks(root, { dryRun = false } = {}) {
  const catalog = JSON.parse(
    await fs.readFile(path.join(root, 'public/data/products.json'), 'utf8')
  );
  const outputs = [];
  for (const { image } of catalog) {
    if (!/^assets\/images\/products\/[^/\\]+\.(?:png|jpe?g)$/i.test(image)) {
      throw new Error(`Unsupported product raster path: ${image}`);
    }
    const outputPath = path.join(root, 'public', image);
    const { inputPath } = resolveImageSource(root, outputPath);
    outputs.push({ inputPath, outputPath, data: await renderProductFallback(inputPath) });
  }
  // Decode every master successfully before replacing any published fallback.
  for (const { inputPath, outputPath, data } of outputs) {
    if (!dryRun) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, data);
    }
    console.log(
      `${dryRun ? 'DRY' : 'OK'} ${path.relative(root, inputPath)} -> ${path.relative(root, outputPath)} (${data.length} B)`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run')) {
    console.error('Usage: node tools/image-optimizer/resize-product-fallbacks.mjs [--dry-run]');
    process.exitCode = 1;
  } else {
    resizeProductFallbacks(process.cwd(), { dryRun: args.includes('--dry-run') }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
