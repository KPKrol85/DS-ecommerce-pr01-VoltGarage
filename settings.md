# Project settings

## Environment
- Project name: `volt-garage`
- Project type: static multi-page front-end showcase
- Required Node.js version: `>=18`
- Package manager: `npm`
- Main source entrypoints:
  - HTML: [index.html](C:/Users/KPKro/MY%20FILES/codex-playground/pr-01-voltgarage/index.html)
  - CSS: [css/main.css](C:/Users/KPKro/MY%20FILES/codex-playground/pr-01-voltgarage/css/main.css)
  - JS: [js/main.js](C:/Users/KPKro/MY%20FILES/codex-playground/pr-01-voltgarage/js/main.js)
- Build output: [dist](C:/Users/KPKro/MY%20FILES/codex-playground/pr-01-voltgarage/dist)

## NPM scripts

| Script | Command | What it does | When to use it |
| --- | --- | --- | --- |
| `img:opt` | `node tools/image-optimizer/optimize-images.mjs --only=jpg` | Generates optimized variants for JPG source images. | Use after changing JPG assets. |
| `img:opt:png` | `node tools/image-optimizer/optimize-images.mjs --only=png` | Generates optimized variants for PNG source images. | Use after changing PNG assets. |
| `img:opt:all` | `node tools/image-optimizer/optimize-images.mjs --only=all` | Runs image optimization for all supported input types. | Use for a full asset refresh. |
| `img:opt:out` | `node tools/image-optimizer/optimize-images.mjs --mode=output --out=tools/image-optimizer/output --only=all` | Writes optimized output to the tool output directory instead of overwriting project assets. | Use for non-destructive review of generated images. |
| `img:opt:dry` | `node tools/image-optimizer/optimize-images.mjs --dry-run --only=all` | Shows what the optimizer would process without writing files. | Use before a bulk optimization run. |
| `build:css` | `postcss css/main.css -o css/main.min.css --no-map -u postcss-import cssnano` | Bundles imported CSS partials and minifies them into `css/main.min.css`. | Use when preparing production CSS. |
| `build:js` | `esbuild js/main.js --bundle --minify --format=esm --platform=browser --target=es2022 --outfile=js/main.min.js` | Bundles and minifies the browser JS entry into `js/main.min.js`. | Use when preparing production JS. |
| `build:assets` | `npm run build:css && npm run build:js` | Runs both production asset builds. | Use when only CSS/JS bundles need regeneration. |
| `build:dist` | `node scripts/build-dist.js` | Rebuilds `dist/`, expands HTML partials, copies required files, and rewrites source asset references to minified bundles. | Use when preparing the deployable package. |
| `build` | `npm run build:assets && npm run build:dist` | Produces minified assets and a full deployable `dist/` package. | Use for a complete production build. |
| `preview` | `node scripts/preview-dist.js` | Starts a local server for previewing the built `dist/` package. | Use after `build` to inspect the deployment output locally. |
| `preview:dist` | `npm run preview` | Alias for the dist preview server. | Use when you prefer an explicit preview script name. |
| `build:preview` | `npm run build && npm run preview` | Builds the project and immediately launches the local dist preview server. | Use for a full build-and-preview cycle. |
| `qa` | `npm run qa:html && npm run validate:jsonld && npm run qa:links && npm run qa:js && npm run qa:css` | Runs the main validation suite for HTML, structured data, internal links, JS, and CSS. | Use before release or after broader source changes. |
| `qa:format` | `npm run format:check` | Alias for formatting verification. | Use when you only want a formatting compliance check. |
| `qa:html` | `html-validate --config htmlvalidate.json index.html 404.html offline.html thank-you.html pages/cart.html pages/checkout.html pages/collections.html pages/contact.html pages/cookies.html pages/new-arrivals.html pages/privacy-policy.html pages/product.html pages/promotions.html pages/shop.html pages/terms.html` | Runs `html-validate` against the current source page inventory. | Use after HTML edits or route/page changes. |
| `qa:js` | `eslint --max-warnings 0 "js/**/*.js" "scripts/**/*.js" "tools/**/*.mjs" --ignore-pattern "js/**/*.min.js"` | Lints source JS, project scripts, and tooling while excluding minified bundles. | Use after JS or build-script changes. |
| `qa:css` | `stylelint --max-warnings 0 "css/**/*.css" --ignore-pattern "css/**/*.min.css"` | Lints source CSS while excluding minified CSS files. | Use after CSS changes. |
| `format` | `prettier . --write` | Formats repository files in place using Prettier. | Use when you want to normalize formatting across the repo. |
| `format:html-tight` | `prettier --write "index.html" "404.html" "offline.html" "thank-you.html" "pages/**/*.html" && node scripts/format-html-tight.js` | Formats HTML with Prettier and then reapplies the project's tighter head-spacing convention. | Use after larger HTML edits. |
| `format:check` | `prettier . --check` | Verifies whether repository files already match Prettier formatting. | Use in CI or before commit when you do not want to rewrite files. |
| `validate:jsonld` | `node scripts/validate-jsonld.js` | Parses JSON-LD blocks and verifies schema expectations used in this project. | Use after metadata or structured-data changes. |
| `qa:links` | `node scripts/validate-internal-links.js` | Validates internal HTML `href` targets across source pages. | Use after adding, renaming, or moving pages and internal links. |
| `qa:smoke` | `node scripts/qa-smoke-lighthouse.js` | Runs Lighthouse smoke checks in non-enforcing mode. | Use for a quick performance/accessibility/SEO snapshot. |
| `qa:smoke:enforce` | `node scripts/qa-smoke-lighthouse.js --enforce` | Runs Lighthouse smoke checks in enforcing mode. | Use when thresholds should fail the run. |

## Operational notes
- `dist/` is generated output and should not be treated as the development source of truth.
- Source HTML uses include comments such as `<!-- @include src/partials/header.html -->`; these are expanded only during `build:dist`.
- `build:dist` expects `css/main.min.css` and `js/main.min.js` to exist first, so `build` is the safest full production command.
- Public route inventory is currently maintained in multiple files such as `package.json`, `sitemap.xml`, and `site.webmanifest`; when routes change, keep those files synchronized.
- The project is a front-end showcase implementation, so QA and documentation should be interpreted against that scope rather than against a full backend commerce platform.
