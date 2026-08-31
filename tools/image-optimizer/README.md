# Image Optimizer (products)

Professional, repeatable image optimization pipeline for product images.
Input source of truth: JPG/JPEG files under `assets/images/products/` (recursive).

## Requirements

- Node.js 18+ (sharp support)
- npm

Note: AVIF support depends on sharp/libvips in your environment. If AVIF fails,
update sharp or install a prebuilt binary for your platform.

## Install

```bash
npm install
```

## NPM scripts

- `npm run img:opt` - optimize JPG only (inplace, with backup)
- `npm run img:opt:all` - optimize JPG + generate WEBP/AVIF (inplace, with backup)
- `npm run img:opt:out` - output to `tools/image-optimizer/output`
- `npm run img:opt:dry` - dry-run (no writes)

## Examples

```bash
# Default inplace (JPG + WEBP + AVIF)
npm run img:opt:all

# JPG only
npm run img:opt

# Output mode (no overwrites)
npm run img:opt:out

# Dry-run
npm run img:opt:dry

# Custom quality and AVIF effort
node tools/image-optimizer/optimize-images.mjs --quality-jpg=75 --quality-webp=75 --quality-avif=45 --effort-avif=7
```

## Backups

In `inplace` mode, before overwriting any JPG, the original file is copied to:
`tools/image-optimizer/backup/<YYYYMMDD-HHMMSS>/...` (folder structure preserved).

## CLI flags

```bash
--quality-jpg=80
--quality-webp=80
--quality-avif=50
--effort-avif=6
--mode=inplace|output   # default: inplace
--out=PATH              # required for output mode
--dry-run               # boolean
--only=jpg|all          # default: all
--glob=PATTERN          # optional glob override
```

## <picture> usage

```html
<picture>
  <source srcset="assets/images/_optimized/products/example.avif" type="image/avif" />
  <source srcset="assets/images/_optimized/products/example.webp" type="image/webp" />
  <img src="assets/images/products/example.jpg" alt="Product" />
</picture>
```
