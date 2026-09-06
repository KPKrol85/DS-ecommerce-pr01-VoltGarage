# Daily Front-End Audit — Volt Garage

**Audit date:** 2026-09-06
**Project type:** Static Vanilla HTML/CSS/JavaScript multi-page storefront demo, built and previewed with Vite 8, deployed as static output to Netlify
**Audit mode:** Static repository review

## Overall assessment

The build, packaging, and validation layer is the strongest part of this repository: one HTML renderer serves both dev and production, the service worker deployment identity is derived from content rather than a manual counter, and package validation runs automatically at the end of every build. Module architecture is disciplined — features initialise only when their selectors exist, storage access is probed and degrades silently, and every catalog view has explicit loading, empty, and error states.

The unresolved risk is concentrated in correctness rather than architecture. A catalog entry points at a file extension that does not exist, runtime `ItemList` structured data resolves item URLs against the origin instead of the current directory, the two root-level fallback documents use document-relative links while being served at arbitrary URLs, and the shared phone validation pattern rejects the exact number format the site prints in its own footer. None of these block the core browse-and-cart flow, but each is a real defect the current QA pipeline is not shaped to detect — every one of them lives in runtime-generated output or in data files that the HTML, link, and JSON-LD validators do not reach.

No blocker prevents continued development. The next step should be closing the correctness gaps above and extending validation to cover product data and runtime-generated URLs.

## Verified strengths

- Single-source HTML composition: `scripts/html.mjs` renders includes, conditionals, and path tokens identically in dev server, production build, and both validators, and fails loudly on cycles, out-of-boundary includes, and unresolved tokens.
- Content-derived deployment identity: `scripts/vite-volt-garage.mjs` hashes build output, every `public/` file, and the worker source into the service worker build ID and injects the precache list, removing manual release numbering.
- Automatic production-package validation: `scripts/validate-package.mjs` runs at the end of every build and asserts route presence, content-hashed bundle references, byte equality of copied `public/` files, Vite manifest integrity, web manifest icon/shortcut/screenshot paths, and absence of unresolved worker tokens.
- Build-contract tests in `scripts/tests/build-contract.test.mjs` cover entry discovery, template semantics including both conditional branches, and the failure modes of package validation rather than only its success path.
- Defensive initialisation: `js/main.js` gates every feature behind a present-selector check, and `js/services/storage.js` probes `localStorage` once and returns null values instead of throwing when it is unavailable.
- Progressive-enhancement baseline: every dynamic catalog container ships a static `products-fallback` paragraph in source HTML, and runtime states use `aria-busy`, `role="status"`, and `role="alert"` consistently through `js/ui/state.js`.
- Coherent design tokens with light/dark parity in `css/partials/themes.css`, and `prefers-reduced-motion` handling present in four of the five CSS partials.
- Scoped service worker behaviour in `src/sw.js`: cache-first restricted to content-addressed `/build/*`, network-first with revalidation for stable URLs, runtime cache trimming, and activation that deletes only `volt-garage-` prefixed caches.
- Consistent document metadata: all 15 rendered documents carry exactly one `<h1>`, canonical, Open Graph, and Twitter tags, and a scripted scan found no duplicate element IDs on any page.
- Hosting security baseline in `public/_headers`: CSP with `frame-ancestors 'none'` and `object-src 'none'`, nosniff, referrer and permissions policy, with one-year `immutable` caching restricted to hashed `/build/*`.

## P0 — Critical risks

None detected.

## P1 — Important issues worth fixing next

### [P1-01] Catalog entry references a product image file that does not exist

- **Classification:** Defect
- **Evidence:** `public/data/products.json:94` (`interior-mat`); `public/assets/images/products/` contains `wnetrze-02.png` only
- **Current behavior:** The entry declares `assets/images/products/wnetrze-02.jpg`. A filesystem check of every `image` value in the catalog shows this is the only missing file; the `_optimized` AVIF and WebP variants for the same base name do exist. Grid and detail views hide the problem because their `<picture>` sources resolve, but `js/features/cart.js:85` renders a bare `<img>` built from the same field, and the `Product` and `ItemList` structured data take their image URLs from it.
- **Impact:** A broken product image in the cart, an invalid image URL in structured data for that product, and no raster fallback wherever AVIF and WebP are unavailable.
- **Recommended direction:** Correct the catalog entry to the extension that exists, and extend validation to assert that every asset path declared in product data resolves to a file.

### [P1-02] Runtime ItemList structured data points at a product route that does not exist

- **Classification:** Defect
- **Evidence:** `js/ui/structured-data.js:4`; consumers at `js/features/products.js:135` and the `injectItemListJsonLd` call in `js/features/filters.js`
- **Current behavior:** `toAbsolute` resolves relative hrefs against `window.location.origin`, which discards the current directory. On `/pages/shop.html`, `/pages/new-arrivals.html`, and `/pages/promotions.html`, `productLink()` returns `product.html?id=…`, which `toAbsolute` turns into `https://<origin>/product.html?id=…`. The deployed route is `/pages/product.html?id=…`. Breadcrumb and image URLs happen to survive because their `../` prefix collapses to the same root path.
- **Impact:** Every item URL in the injected `ItemList` on the three listing pages resolves to a path that returns the 404 page. `scripts/validate-jsonld.js` asserts only schema types and a source regex, so it cannot detect this.
- **Recommended direction:** Resolve runtime absolute URLs against the current document URL rather than the bare origin.

### [P1-03] Root-level fallback documents use document-relative links but are served at arbitrary URLs

- **Classification:** Defect
- **Evidence:** `public/_redirects` (`/* /404.html 404`); `src/sw.js:96` (offline fallback); `404.html`, `offline.html`, and the shared partials via `{{rootPrefix}}` / `{{pagesPrefix}}`
- **Current behavior:** Both documents are rendered with root context, so every link in the shared header, footer, and their recovery CTAs is document-relative (`index.html`, `pages/shop.html`). The Netlify catch-all serves `404.html` at any unmatched path, and the worker returns `/offline.html` for uncached navigations while the browser keeps the originally requested URL. Their CSS and JS references are root-absolute after the build and are unaffected. No `<base>` element is present in any document.
- **Impact:** For any miss below the root — for example `/pages/typo.html` — the entire navigation shell resolves to non-existent paths such as `/pages/pages/shop.html` and `/pages/index.html`. The pages whose purpose is recovery cannot recover.
- **Recommended direction:** Give the two fallback documents root-absolute link targets, consistent with how their already-absolute asset references behave.

### [P1-04] Phone validation pattern rejects space-separated numbers

- **Classification:** Defect
- **Evidence:** `pages/contact.html:233`, `pages/checkout.html:149`, `js/main.js:57`
- **Current behavior:** The pattern is `^[0-9+][0-9\\s-]{6,19}$`. The doubled backslash makes the character class match a literal backslash and the letter `s` rather than whitespace. `js/main.js` sets `form.noValidate` and re-tests the same attribute with `new RegExp(field.pattern)`, so both validation layers agree. Evaluated directly: `533537091` and `533-537-091` pass; `533 537 091` and `+48 533 537 091` fail.
- **Impact:** The required phone field rejects the exact format the site prints in its own footer and contact page, blocking submission of the Netlify contact form and the checkout form until the user removes the spaces. The rejection message gives no formatting guidance.
- **Recommended direction:** Correct the character class so whitespace matches, and keep the two copies of the pattern derived from a single definition.

### [P1-05] Homepage newsletter form has no submission target and no handler

- **Classification:** Defect
- **Evidence:** `index.html:275-281`
- **Current behavior:** The form declares no `action`, no `method`, and none of the `data-contact-form` / `data-checkout-form` hooks that `js/main.js` binds; its required email input has no `name` attribute. Submitting therefore performs a default GET to the current document with no field data.
- **Impact:** The submit button reloads the homepage, discards the address, and shows neither confirmation nor error — a public control advertising a signup capability the project does not implement.
- **Recommended direction:** Either route it through the same validated flow the contact form uses, or state its demonstration-only status the way the checkout scope is already stated in project documentation.

### [P1-06] Service worker skips waiting, contradicting the documented user-confirmed update flow

- **Classification:** Contract mismatch
- **Evidence:** `src/sw.js:46` and `src/sw.js:60`; `js/ui/pwa-prompts.js:135-166`; README PWA section and the service-worker notes in `docs/settings.md`
- **Current behavior:** `src/sw.js` calls `self.skipWaiting()` unconditionally inside `install` and `self.clients.claim()` inside `activate`. `js/ui/pwa-prompts.js` implements the opposite contract: an update toast whose refresh action posts `SKIP_WAITING` to `registration.waiting`, plus a `controllerchange` listener that calls `window.location.reload()` with no guard for the first-install transition from no controller.
- **Impact:** The two designs are mutually exclusive in source. With `skipWaiting` in `install`, a worker cannot rest in `waiting`, so the documented user-confirmed refresh has nothing to act on, and the unguarded `controllerchange` handler is positioned to reload the page without user action — including on a first visit, when the controller changes from none to the newly claimed worker. Exact reload timing requires browser verification.
- **Recommended direction:** Pick one update contract. Either drop `skipWaiting` from `install` so the prompt controls activation, or drop the prompt and guard the reload against the first-install controller change.

## P2 — Minor refinements

### [P2-01] Shared navigation labels do not match their destinations

- **Classification:** Defect
- **Evidence:** `src/partials/header.html:55-56`, `src/partials/footer.html:36-37`
- **Current behavior:** The "Dostawa" entry links to `checkout.html` and the "Zwroty" entry links to `cart.html`. Neither destination contains delivery or returns content.
- **Impact:** Present on all 15 pages through the shared partials; a visitor looking for the returns policy is sent to their cart.
- **Recommended direction:** Point the entries at content that answers them, or remove them until such pages exist.

### [P2-02] Footer column headings skip a heading level on every page

- **Classification:** Defect
- **Evidence:** `src/partials/footer.html:23`, `:33`, `:41`, `:49`
- **Current behavior:** The four footer columns use `<h4>` regardless of the surrounding document. A scripted heading scan across all 15 rendered documents shows a level skip on 14 of them — `h2` to `h4` on content pages and `h1` to `h4` on `404.html`, `offline.html`, `thank-you.html`, and `pages/collections.html`. Separate in-page skips exist where a hero or summary card uses `<h3>` before any `<h2>` (`index.html` hero card, `pages/cart.html` summary panel).
- **Impact:** Screen-reader heading navigation reports a gap in the outline on nearly every page, from one shared source.
- **Recommended direction:** Align the footer column headings with the level the page outline actually reaches, and resolve the two in-page `<h3>`-before-`<h2>` cases.

### [P2-03] Theme toggle announces the theme value instead of the control's purpose

- **Classification:** Defect
- **Evidence:** `src/partials/header.html:87`, `js/ui/theme.js:17`
- **Current behavior:** `reflectPreference` sets the button's `aria-label` to the current theme name, so the accessible name becomes "light" or "dark"; the initial markup uses "auto". Because `aria-label` overrides `title`, the descriptive `title` attribute never contributes to the accessible name. The element also carries `aria-live="polite"` on an interactive control.
- **Impact:** On every page the toggle is announced as a bare state word plus its pressed state, with no indication of what activating it does.
- **Recommended direction:** Keep a stable descriptive accessible name and let `aria-pressed` carry the state; reconsider the live region on the control itself.

### [P2-04] Add-to-cart button label sticks after repeated clicks

- **Classification:** Defect
- **Evidence:** `js/features/cart.js:64-70`
- **Current behavior:** Each click captures `button.textContent` as the label to restore and schedules a 1200 ms timeout. A second click inside that window captures the already-swapped confirmation text, so the later timeout restores the confirmation after the earlier one restores the original label.
- **Impact:** The primary catalog action button is left permanently showing the confirmation label on every card the user clicks twice quickly, both visually and as its accessible name. The cart total itself stays correct.
- **Recommended direction:** Capture the original label once per button, or reset the pending timeout on each click.

### [P2-05] Collections page advertises a category the catalog does not contain

- **Classification:** Defect
- **Evidence:** `pages/collections.html:153`, `pages/collections.html:156`; `public/data/products.json`
- **Current behavior:** The "Detailing" card links to `shop.html?category=Gadżety`, the same target as the "Gadżety" card. The catalog defines five categories — Emblematy, Naklejki, Gadżety, Wnętrze, Zewnętrzne — and `#filter-category` in `pages/shop.html` lists exactly those five. The homepage also renders a non-interactive "Detailing" pill at `index.html:239`.
- **Impact:** Two of six category cards lead to the same filtered result, and the promised category filter does not exist.
- **Recommended direction:** Either introduce the category in the catalog and the shop filter, or present Detailing as part of Gadżety rather than as a separate destination.

### [P2-06] Checkout reports an accepted submission for an empty cart

- **Classification:** Defect
- **Evidence:** `js/main.js` (`initForms` submit handler, `handlesSubmissionInJs` branch); `js/features/cart.js` (`initCheckoutSummary`); `pages/checkout.html`
- **Current behavior:** The checkout submit handler validates only field-level constraints. With no items stored, the summary renders `0 zł` across all three lines and a valid form submission still sets the success message and resets the fields.
- **Impact:** The confirmation asserts acceptance in a state where there is nothing to accept. Project documentation records that checkout is simulated, but the on-page message does not.
- **Recommended direction:** Guard submission on a non-empty cart, and word the confirmation so it does not claim more than the demonstration flow performs.

### [P2-07] Offline page retry control returns to the offline page

- **Classification:** Defect
- **Evidence:** `offline.html:98`
- **Current behavior:** The primary action links to `offline.html`. Activating it navigates to the offline document again rather than re-attempting the navigation that failed; with the network restored, the worker's network-first path serves `/offline.html` successfully and the same page is shown.
- **Impact:** The most prominent recovery control on the offline fallback never returns the visitor to real content. The secondary homepage link does work when its relative target resolves, which P1-03 covers separately.
- **Recommended direction:** Make the retry action re-request the current location rather than link to the fallback document.

### [P2-08] Homepage hero card repeats the same statistic twice

- **Classification:** Defect
- **Evidence:** `index.html:184-190`
- **Current behavior:** The first two `.stat` blocks are identical — the same figure over the same label — inside a four-item stats grid.
- **Impact:** A visible content duplication in the primary above-the-fold panel of the site's most important page.
- **Recommended direction:** Replace the duplicate with the intended second statistic or reduce the grid to three items.

### [P2-09] Unreferenced and duplicated assets are shipped with the production package

- **Classification:** Maintenance risk
- **Evidence:** `public/assets/images/hero/` and `public/assets/images/_optimized/hero/` (only `hero-05` is referenced, from `index.html`); `public/assets/images/og/og-1200x1200.jpg`; `public/assets/icons/favicon/favicon-96x96.png`; `public/assets/images/_optimized/products/zewnetrze-02.avif` and `.webp`; `public/assets/images/bundle.svg`, `emblem.svg`, `exterior.svg`, `gadget.svg`, `interior.svg`, `sticker.svg`; `public/assets/icons/shortcuts/dwadawedwea/` and `public/assets/icons/shortcuts/Projekt bez nazwy/`
- **Current behavior:** A reference scan across all HTML, CSS, JS, JSON, manifest, and sitemap sources finds roughly 4.8 MB of asset files with no reference anywhere, on top of six duplicate shortcut icons in two directories whose names indicate accidental commits, one of which contains a space. `publicDir` copies all of it verbatim into `dist/`, and `scripts/vite-volt-garage.mjs` folds every `public/` file into the service worker build-ID digest.
- **Impact:** Deployed payload and repository size carry unused files; touching any of them changes the deployment ID and invalidates every client cache; the `zewnetrze-02` pair sits one character away from the real `zewnetrzne-02` variants, which is exactly the kind of near-miss that produces a wrong reference later.
- **Recommended direction:** Remove the unreferenced assets and the duplicate shortcut directories, or record in project documentation why they are retained.

### [P2-10] Documentation still lists `humans.txt` as part of the deployment contract

- **Classification:** Contract mismatch
- **Evidence:** `README.md:77`, `README.md:140`, `README.md:278`, `README.md:341`, `docs/settings.md:16`
- **Current behavior:** Four README passages and the settings document describe `humans.txt` as a tracked `public/` file and as part of what `dist/` contains. The file was removed from the repository and from the package requirement, and `scripts/validate-package.mjs` no longer requires it.
- **Impact:** The deployment-contract sections state a fact about production output that is no longer true, in the documents a maintainer consults to reason about `public/` ownership.
- **Recommended direction:** Remove the stale references so documentation matches the current `public/` inventory.

### [P2-11] Leftover development artifacts in the product rendering module

- **Classification:** Maintenance risk
- **Evidence:** `js/features/products.js:59`, `js/features/products.js:79`, `js/features/products.js:159`
- **Current behavior:** Two `CHANGED: img -> picture` HTML comments sit inside the card templates and are emitted into the DOM of every rendered product card. `initShopProducts` is exported but imported nowhere — `js/main.js` routes `[data-products="shop"]` to `initFilters`, which performs the same work. The ESLint `no-unused-vars` rule does not flag unused exports.
- **Impact:** Production markup carries stale editing notes, and a duplicate shop-rendering path remains that a future change could be applied to instead of the live one.
- **Recommended direction:** Remove both markers and the unused export.

## Extra quality improvements

### Extend validation to product-data asset paths and runtime-generated URLs

- **Evidence:** `scripts/validate-internal-links.js` checks only `href` attributes in rendered HTML; `scripts/validate-package.mjs` checks `src`, `srcset`, and CSS `url()` in built output; `scripts/validate-jsonld.js` checks schema types only. Product images and item URLs are produced at runtime from `public/data/products.json` and never appear in static markup.
- **Potential value:** The same check would have caught both P1-01 and P1-02 before review, and would keep catching them as the catalog grows.
- **Scope boundary:** An addition to the existing validator scripts using tooling already in the repository; it does not require new dependencies or a change to the QA workflow shape.

### Harden cart state deserialization against malformed stored values

- **Evidence:** `js/features/cart.js:13-20` recovers from `JSON.parse` failures but returns whatever parsed successfully; `getCart` consumers then call `cart.find` and `cart.reduce` on the result.
- **Potential value:** A non-array or partially shaped value in the cart key would throw on every page that renders the cart badge, and the current recovery path does not cover that. A shape check would keep the badge and add-to-cart working across any future catalog or schema change.
- **Scope boundary:** Local resilience for an edge case the project does not currently produce itself; not a defect in the present implementation.

### Provide a no-JavaScript dark-theme fallback in CSS

- **Evidence:** Theme selection lives entirely in the inline script in each document head and in `js/ui/theme.js`; `css/partials/themes.css` defines palettes only under `:root` / `[data-theme='light']` and `[data-theme='dark']`, with no `prefers-color-scheme` block. Documents declare `<meta name="color-scheme" content="light dark">`.
- **Potential value:** A visitor with JavaScript disabled and a dark system preference currently receives the light palette while the document advertises support for both. A `prefers-color-scheme` fallback would align the two without changing the JavaScript-driven model the project documents.
- **Scope boundary:** Optional refinement to an intentional JS-first theming decision, not a correction to it.

### Reduce the shipped raster payload for product fallbacks

- **Evidence:** `public/assets/images/products/` holds 12 source rasters totalling roughly 18.7 MB, several over 2 MB each; these are the `<img>` fallbacks referenced from `js/features/products.js`. The AVIF and WebP variants that modern browsers select are two orders of magnitude smaller.
- **Potential value:** Smaller repository and deployed package, and a far smaller worst case for any client that falls back to the raster source. No runtime measurement was taken, so this is stated as payload size only.
- **Scope boundary:** The existing `tools/image-optimizer/` workflow already owns variant generation; this concerns the retained source files, which are a deliberate part of the asset pipeline.

### Replace the inline-script allowance in the CSP with per-script hashes

- **Evidence:** `public/_headers` sets `script-src 'self' 'unsafe-inline'`. The only inline scripts in the project are the theme preload block repeated in each document head and the static JSON-LD blocks in `index.html` — all build-time stable.
- **Potential value:** Removes the broadest allowance in an otherwise tight policy while keeping the flash-free theme application the inline script exists for.
- **Scope boundary:** The current allowance is a working, deliberate trade-off for a static host; no injection path from user-controlled input exists in the present implementation, since all rendered content originates in the local catalog file.

## Verification performed

- Inspected: all 15 HTML documents, both `src/partials/` files, all 17 modules under `js/`, `src/sw.js`, `css/main.css` and all five CSS partials, every script in `scripts/` including the build-contract tests, `vite.config.mjs`, `package.json`, all lint and format configurations, `public/` hosting and runtime files (`_headers`, `_redirects`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `data/products.json`), `README.md`, `docs/settings.md`, and `docs/CHANGELOG.md`.
- Executed, read-only: `node --check` over every `.js` and `.mjs` file in `js/`, `scripts/`, `tools/`, `src/`, and `vite.config.mjs` — all parse cleanly. `JSON.parse` over `products.json`, `site.webmanifest`, `package.json`, and the JSON configuration files — all valid.
- Executed, read-only scripted checks: filesystem existence check of every `image` path in `products.json` and its derived `_optimized` variants; direct regex evaluation of both `pattern` attributes against representative Polish phone formats; `URL()` resolution of `toAbsolute()` inputs from each page depth; heading-level and duplicate-ID scan across all 15 documents with partials expanded; unreferenced-asset scan across `public/assets`; `git status` and `git log`.
- Not run: `npm run qa` and its members (`html-validate`, `eslint`, `stylelint`), `format:check`, `qa:links`, `validate:jsonld`, `qa:build`, `build`, `qa:package`, and both smoke commands. `node_modules/` is absent in this worktree and installing dependencies is outside the permitted scope of this audit; the otherwise pure-Node validators import `fast-glob` and could not run either. No result from these checks is claimed.
- Verification limitations: no browser, assistive-technology, Lighthouse, or network verification was performed. `dist/` does not exist, so generated output was not inspected and the production package contract was assessed from the build configuration and validator source only. Netlify header, redirect, and Forms behaviour, and the live deployment, were assessed from repository configuration only. Accessibility findings are source-level; no conformance claim is made in either direction.

## Senior rating

**Rating:** 7/10

The build and packaging layer is stronger than typical for a static multi-page project: one renderer shared by dev, build, and validators; a content-derived service worker identity; automatic package validation covering routes, hashed bundles, public-file equality, and manifest paths; and tests that exercise failure modes rather than only the happy path. Module boundaries are clean, initialisation is defensive, and progressive-enhancement fallbacks are consistently present. The rating is held down by a cluster of concrete correctness defects that all sit in the blind spot of that otherwise good pipeline — a catalog image path, runtime structured-data URLs, fallback-page link resolution, and a form validation pattern — together with shared-shell accessibility and content issues that repeat across all 15 pages. All are contained and locally fixable; none indicate an architectural problem.
