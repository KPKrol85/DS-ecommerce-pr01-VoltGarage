# Image Optimizer (products)

Image variant generation for JPG/JPEG and PNG sources. Product masters live in `src/assets/images/products/`; other image sources remain under `public/assets/images/` (recursive).

## Requirements

- Node.js compatible with the project's `^20.19.0 || >=22.12.0` engine
- npm

Note: AVIF support depends on sharp/libvips in your environment. If AVIF fails,
update sharp or install a prebuilt binary for your platform.

## Install

Run installation and all commands below from the repository root.

```bash
npm ci
```

## NPM scripts

- `npm run img:opt` - generate WebP/AVIF variants from JPG/JPEG sources
- `npm run img:opt:png` - generate WebP/AVIF variants from PNG sources
- `npm run img:opt:all` - generate WebP/AVIF variants from JPG/JPEG/PNG sources
- `npm run img:opt:out` - write variants to `tools/image-optimizer/output`
- `npm run img:opt:dry` - dry-run (no writes)

## Examples

```bash
# Default output: public/assets/images/_optimized/
npm run img:opt:all

# JPG/JPEG sources only; generates WebP and AVIF
npm run img:opt

# Separate output directory
npm run img:opt:out

# Dry-run
npm run img:opt:dry

# Custom quality and AVIF effort
node tools/image-optimizer/optimize-images.mjs --quality-webp=75 --quality-avif=45 --effort-avif=7
```

## Source and output ownership

Original JPG/JPEG/PNG masters remain unchanged. Product inputs come exclusively from `src/assets/images/products/`, mapped to the virtual `products/` subtree. For example, `src/assets/images/products/gadget-01.png` generates `public/assets/images/_optimized/products/gadget-01.webp` and `.avif`. Even a custom glob selecting `public/assets/images/products/gadget-01.png` reads the retained master instead of the published fallback. A missing master fails the command; it never falls back to the reduced raster.

Other images retain their existing input and output behavior. The default mode writes WebP/AVIF variants to `public/assets/images/_optimized/`, preserving paths relative to `public/assets/images/`. Output mode writes the same variants under `--out`; explicitly selected files outside either source root still use basenames with a warning. The tool does not create backups; `--mode=inplace` is a deprecated alias for the default mode. Existing variants are skipped when their timestamps are at least as new as the master's timestamp.

Vite copies the prepared contents of `public/` into `dist/` during the build and does not run image optimization. Files under `public/assets/images/` retain public URLs under `/assets/images/`; do not include `public/` in HTML URLs.

### Published product raster fallbacks

The catalog `image` remains the authoritative public URL. The twelve full-resolution masters were preserved byte-for-byte outside `public/`: eleven are 1536×1024 and `emblemat-01.jpg` is 1024×1024. Keep these files in source control. They are neither imported by the application nor copied by Vite. Package validation rejects publication of their source paths or exact bytes, including renamed copies.

Regenerate only the product JPG/PNG fallbacks from these masters:

```bash
node tools/image-optimizer/resize-product-fallbacks.mjs --dry-run
node tools/image-optimizer/resize-product-fallbacks.mjs
```

This separate command preserves filenames and formats, resizes proportionally inside **1080×960** with Lanczos3 and no enlargement or crop, and strips output metadata. Current landscape fallbacks are **1080×720**; the square emblem is **960×960**. PNG uses lossless encoding of the resized pixels (compression 9, adaptive filtering, no palette); JPEG uses quality 82, 4:2:0 subsampling and MozJPEG. This resize changes pixels; it extends the earlier lossless recompression without altering the retained masters or existing AVIF/WebP files.

The policy follows the rendered layout, not the markup's 800×600 attributes. Chromium measurements at 375–1920 CSS pixels, including layout breakpoints, found detail media up to 913×684 at a 1023-pixel viewport and 736×552 on desktop. Cards measured about 431×323 at 499 pixels. Both use the existing 4:3 `object-fit: cover` frame. The 720-pixel landscape height covers the largest detail frame at DPR 1 and approximately DPR 2 for cards; the square retains enough width for the same detail frame. Full-density DPR 2 detail viewing is not promised by the raster fallback. AVIF/WebP retain their original dimensions and quality.

Both dry-run commands encode in memory without writing files. The fallback command validates and encodes all catalog masters before writing any fallback, and does not touch optimized variants. Run product asset checks, `qa:build`, and a production build after regeneration. The source/publish tests enforce retained source dimensions, reduced fallback bounds, unchanged aspect ratios, and no master copies under `public/`.

## CLI flags

```text
--quality-webp=70
--quality-avif=50
--effort-avif=6
--mode=default|output   # default: default
--out=PATH              # required for output mode
--dry-run               # boolean
--only=jpg|png|all       # default: all
--glob=PATTERN          # optional glob override, relative to the repository root
```

Default discovery combines `public/assets/images/**/*.{jpg,jpeg,png,JPG,JPEG,PNG}` and `src/assets/images/products/**/*.{jpg,jpeg,png,JPG,JPEG,PNG}`; `_optimized/` directories are excluded and product inputs are deduplicated. Thus masters remain discoverable even if published fallbacks need rebuilding. `--glob` replaces default discovery and can select either public product paths or master paths; both map to the same masters and optimized URLs. The legacy `--quality-jpg` option is accepted but does not affect variant output: the variant command does not recompress JPG originals.

## <picture> usage

```html
<picture>
  <source srcset="/assets/images/_optimized/products/example.avif" type="image/avif" />
  <source srcset="/assets/images/_optimized/products/example.webp" type="image/webp" />
  <img src="/assets/images/products/example.jpg" alt="Product" />
</picture>
```
