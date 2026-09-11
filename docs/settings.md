# Project settings

## Environment

- Project name: `volt-garage`
- Project type: static Vanilla HTML/CSS/JavaScript multi-page front-end showcase
- Development/build/preview system: Vite 8.2.2, configured in [vite.config.mjs](../vite.config.mjs)
- Required Node.js version: `^20.19.0 || >=22.12.0`
- Package manager: `npm`; install the locked dependencies with `npm ci`
- Main source entrypoints:
  - HTML: [index.html](../index.html), the other root `*.html` files, and `pages/**/*.html` (15 documents)
  - Shared HTML: `src/partials/`
  - CSS: [css/main.css](../css/main.css), importing `css/partials/`
  - JS: [js/main.js](../js/main.js), importing the application modules
  - Service Worker: [src/sw.js](../src/sw.js)
- Static resource ownership: `public/`, including `assets/`, `data/products.json`, `site.webmanifest`, `_headers`, `_redirects`, `robots.txt`, and `sitemap.xml`
- Build output: `dist/`, generated and ignored by Git

## NPM scripts

Commands below match `package.json` and run from the repository root.

| Script              | Command                                                                                                                                              | What it does                                                                                                       | When to use it                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `img:opt`           | `node tools/image-optimizer/optimize-images.mjs --only=jpg`                                                                                          | Generates WebP/AVIF variants from JPG/JPEG sources under `public/assets/images/`.                                  | Use after JPG/JPEG source edits.                                     |
| `img:opt:png`       | `node tools/image-optimizer/optimize-images.mjs --only=png`                                                                                          | Generates WebP/AVIF variants from PNG sources under `public/assets/images/`.                                       | Use after PNG source edits.                                          |
| `img:opt:all`       | `node tools/image-optimizer/optimize-images.mjs --only=all`                                                                                          | Generates WebP/AVIF variants from JPG/JPEG/PNG sources under `public/assets/images/`.                              | Use to refresh variants in `public/assets/images/_optimized/`.       |
| `img:opt:out`       | `node tools/image-optimizer/optimize-images.mjs --mode=output --out=tools/image-optimizer/output --only=all`                                         | Writes generated variants to `tools/image-optimizer/output`, preserving source-relative paths.                     | Use to inspect variants outside the published asset tree.            |
| `img:opt:dry`       | `node tools/image-optimizer/optimize-images.mjs --dry-run --only=all`                                                                                | Shows what the optimizer would process without writing files.                                                      | Use before a bulk optimization run.                                  |
| `build`             | `vite build`                                                                                                                                         | Builds all HTML entries, hashes CSS/JS, copies `public/`, generates the Service Worker, and validates `dist/`.     | Use for a complete production build.                                 |
| `preview`           | `vite preview`                                                                                                                                       | Starts Vite preview for the existing production package.                                                           | Use after `build` at `http://127.0.0.1:4173`.                        |
| `qa`                | `npm run qa:html && npm run validate:jsonld && npm run qa:links && npm run qa:product-assets && npm run qa:js && npm run qa:css && npm run qa:build` | Runs source HTML, JSON-LD, internal-link, product-asset, JS, CSS, and build-contract checks.                       | Use before release or after broader source changes.                  |
| `qa:format`         | `npm run format:check`                                                                                                                               | Alias for formatting verification.                                                                                 | Use when you only want a formatting compliance check.                |
| `qa:html`           | `html-validate --config htmlvalidate.json "*.html" "pages/**/*.html"`                                                                                | Runs `html-validate` against root HTML and `pages/**/*.html`.                                                      | Use after HTML edits or route/page changes.                          |
| `qa:js`             | `eslint --max-warnings 0 "js/**/*.js" "src/sw.js" "scripts/**/*.{js,mjs}" "tools/**/*.mjs" "vite.config.mjs"`                                        | Lints app JS, worker source, project scripts, image tooling, and Vite configuration.                               | Use after JS or build-script changes.                                |
| `qa:css`            | `stylelint --max-warnings 0 "css/**/*.css"`                                                                                                          | Lints source CSS.                                                                                                  | Use after CSS changes.                                               |
| `format`            | `prettier . --write`                                                                                                                                 | Formats repository files in place using Prettier.                                                                  | Use when you want to normalize formatting across the repo.           |
| `format:html-tight` | `prettier --write "index.html" "404.html" "offline.html" "thank-you.html" "pages/**/*.html" && node scripts/format-html-tight.js`                    | Formats HTML with Prettier and then reapplies the project's tighter head-spacing convention.                       | Use after larger HTML edits.                                         |
| `format:check`      | `prettier . --check`                                                                                                                                 | Verifies whether repository files already match Prettier formatting.                                               | Use before a commit when you do not want to rewrite files.           |
| `validate:jsonld`   | `node scripts/validate-jsonld.js`                                                                                                                    | Parses JSON-LD blocks and verifies schema expectations used in this project.                                       | Use after metadata or structured-data changes.                       |
| `qa:links`          | `node scripts/validate-internal-links.js`                                                                                                            | Validates internal HTML `href` targets across source pages, resolving static resources from `public/`.             | Use after adding, renaming, or moving pages and internal links.      |
| `qa:product-assets` | `node scripts/validate-product-assets.mjs`                                                                                                           | Validates catalog product raster images and their derived optimized AVIF/WebP variants in `public/`.               | Use after catalog or product image changes; also included in `qa`.   |
| `qa:smoke`          | `node scripts/qa-smoke-lighthouse.js`                                                                                                                | Builds fresh output, starts Vite preview, and runs the installed Lighthouse in report-only mode.                   | Use for a production performance/accessibility/SEO snapshot.         |
| `qa:smoke:enforce`  | `node scripts/qa-smoke-lighthouse.js --enforce`                                                                                                      | Uses the same fresh build and Vite preview with enforced Lighthouse thresholds.                                    | Use when thresholds should fail the run.                             |
| `dev`               | `vite`                                                                                                                                               | Starts the Vite development server with HTML partial rendering and reloads.                                        | Use for source development at `http://127.0.0.1:5173` by default.    |
| `qa:package`        | `node scripts/validate-package.mjs`                                                                                                                  | Validates existing `dist/`: routes, templates, local resources, hashed bundles, manifests, and public-file copies. | Use after `build`; the build also runs this validator automatically. |
| `qa:build`          | `node --test scripts/tests/*.test.mjs`                                                                                                               | Runs Node tests for the HTML renderer and package contract.                                                        | Use for focused build-tooling checks; also included in `qa`.         |

## Operational notes

### Sources, development, and output

- `npm run dev` serves source through Vite at `http://127.0.0.1:5173` by default. `npm run preview` serves the existing production `dist/` at `http://127.0.0.1:4173`; run `npm run build` first and rebuild after source changes. Both servers use strict ports.
- Source HTML uses include comments such as `<!-- @include src/partials/header.html -->`. The renderer in `scripts/html.mjs`, integrated by `scripts/vite-volt-garage.mjs`, expands includes, conditionals, and tokens in both dev and build. It validates include boundaries and cycles and rejects unresolved template instructions; partial edits trigger a dev reload.
- Vite discovers HTML entries from `*.html` and `pages/**/*.html`. Route changes still require updated links, `public/sitemap.xml`, manifest shortcuts in `public/site.webmanifest`, and smoke-page selection where relevant.
- Canonical HTML, CSS, and JS remain unminified. Vite emits production CSS/JS only into `dist/build/` with content hashes and records output dependencies in `dist/.vite/manifest.json`. Do not edit generated `dist/` files.
- Files in `public/` are copied without renaming: `public/assets/` becomes `/assets/`, `public/data/products.json` becomes `/data/products.json`, and `public/site.webmanifest` becomes `/site.webmanifest`. These stable URLs are not content-hashed.
- Image tooling reads `public/assets/images/` and normally writes variants to `public/assets/images/_optimized/`, preserving the original files. Vite copies prepared images; it does not run the optimizer. See the [image-tool README](../tools/image-optimizer/README.md).

### Service Worker and caching

- Edit `src/sw.js`. The Vite build emits `dist/sw.js` with a deployment ID derived from generated outputs, `public/` content, and worker source. The build also injects the precache list; ordinary content changes need no manual release counter. `CACHE_SCHEMA` describes changes to the cache contract.
- `js/main.js` registers `/sw.js` only in production builds, with `updateViaCache: 'none'`; test PWA behavior through production preview.
- First installation completes precaching and activates through the normal Service Worker lifecycle. `clients.claim()` can take control of the open page without an update notification or a forced reload.
- With an existing active worker and controlled clients, an installed update remains waiting. `js/ui/pwa-prompts.js` shows the update notification, including when a waiting worker already exists at page initialization. Discovery, installation, and displaying the notification do not request activation or reload the page.
- Choosing “Odśwież” (Refresh) sends `SKIP_WAITING` to the waiting worker. After that worker activates and claims clients, only the tab that approved it reloads, once. First controller acquisition, replacement without that tab's approval, and duplicate controller events do not trigger additional reloads. While the user leaves the controlled page open without choosing the action, the update waits; closing all controlled clients allows the normal browser lifecycle to activate it.
- Precache includes the home/offline shell, generated bundles, fonts, and logos. The worker uses cache-first for hashed CSS/JS under `/build/` and network-first with revalidation for navigation and mutable assets/data/manifest. Cached content supplies offline fallbacks; an uncached navigation falls back to `/offline.html` when the network is unavailable.
- Runtime caches are limited to 20 HTML documents and 60 assets. Activation deletes only obsolete caches with the `volt-garage-` prefix. Offline availability depends on prior worker installation and cached content.
- `public/_headers` reserves one-year `immutable` caching for `/build/*`. HTML, `/assets/*`, `/data/*`, `/site.webmanifest`, and `/sw.js` use `max-age=0, must-revalidate`.

### QA and production smoke

- `npm run qa` includes `qa:product-assets` and `qa:build`; formatting and Lighthouse are separate. `qa:package` requires existing build output, and the same package validation also runs automatically at the end of every build.
- Both smoke commands create a fresh Vite build and start Vite preview before invoking the installed Lighthouse dependency. They require Chrome/Chromium; `CHROME_PATH` can select its executable.
- The default smoke routes are `/`, `/pages/shop.html`, and `/pages/product.html`. `SMOKE_HOST`, `SMOKE_PORT`, and comma-separated `SMOKE_PAGES` override the host, port, and route list. The default preview address is `127.0.0.1:4173`; stop an existing preview or select a free `SMOKE_PORT` before running smoke.
- Existing thresholds are performance 0.40, accessibility 0.75, best practices 0.70, and SEO 0.70. `qa:smoke` reports threshold misses; `qa:smoke:enforce` or `SMOKE_ENFORCE=1` makes them fail the run.

### Continuous integration

- GitHub Actions runs the `Quality` workflow defined in [.github/workflows/quality.yml](../.github/workflows/quality.yml) on pushes to `main`, on pull requests targeting `main`, and on manual `workflow_dispatch` runs.
- A single `quality` job runs on `ubuntu-latest` with `contents: read` permissions and Node.js 22, which satisfies the `>=22.12.0` side of the engine range. Its steps are `actions/checkout`, `actions/setup-node` with npm caching keyed on the committed `package-lock.json`, `npm ci`, `npm run qa`, and `npm run build`.
- The workflow calls the project's own scripts instead of restating their command chains, so `package.json` stays the single definition of the QA and build contract. No step suppresses failures: a failing command fails the run.
- Formatting (`format:check` / `qa:format`) and both Lighthouse smoke commands stay outside the workflow. Smoke runs need Chrome/Chromium and a preview server, which this workflow does not provide.
- The workflow is quality verification only. It declares no secrets, uploads no artifacts, and performs no deployment; passing CI does not verify Netlify headers, redirects, or form behavior.

### Netlify deployment

- Build command: `npm run build`; publish directory: `dist`; Node engine: `^20.19.0 || >=22.12.0`.
- The package includes generated HTML/bundles/worker and copies of `public/` resources. `public/_headers` retains the security/CSP configuration alongside the cache rules; `public/_redirects` supplies the catch-all `404.html` rule.
- Vite preview does not apply Netlify `_headers`, `_redirects`, or Netlify Forms processing. Local preview is not deployment verification. The repository has no deployment script, and GitHub Actions does not deploy: deployment stays manual and separate from continuous integration.
- The project is a front-end showcase implementation, so QA and documentation should be interpreted against that scope rather than against a full backend commerce platform.
