# Image Optimizer (products)

Image variant generation for JPG/JPEG and PNG sources under `public/assets/images/` (recursive), including products in `public/assets/images/products/`.

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

Original JPG/JPEG/PNG files remain unchanged. The default mode writes WebP/AVIF variants to `public/assets/images/_optimized/`, preserving paths relative to `public/assets/images/`. Output mode writes the same variants under `--out`. The tool does not create backups; `--mode=inplace` is a deprecated alias for the default mode.

Vite copies the prepared contents of `public/` into `dist/` during the build and does not run image optimization. Files under `public/assets/images/` retain public URLs under `/assets/images/`; do not include `public/` in HTML URLs.

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

The default glob is `public/assets/images/**/*.{jpg,jpeg,png,JPG,JPEG,PNG}`; `_optimized/` directories are excluded. The legacy `--quality-jpg` option is accepted but does not affect output: the tool does not recompress JPG originals.

## <picture> usage

```html
<picture>
  <source srcset="/assets/images/_optimized/products/example.avif" type="image/avif" />
  <source srcset="/assets/images/_optimized/products/example.webp" type="image/webp" />
  <img src="/assets/images/products/example.jpg" alt="Product" />
</picture>
```
