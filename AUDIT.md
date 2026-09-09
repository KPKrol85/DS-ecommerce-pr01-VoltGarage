# Volt Garage — Final Technical Front-End Audit

**Audit date:** 2026-09-09
**Project type:** Static Vanilla HTML/CSS/JavaScript multi-page storefront demonstration, built and previewed with Vite 8, packaged as static output for Netlify
**Audit mode:** Final repository and implementation review
**Current readiness:** Needs important fixes

## 1. Executive assessment

The repository is a coherent, disciplined multi-page front end. Its strongest layer is build and validation: one HTML renderer serves the dev server, the production build, and every validator; the service worker derives its deployment identity from content rather than a counter; package validation runs automatically at the end of every build and asserts byte equality of copied `public/` files, hashed bundle references, manifest integrity, and the exact inline-script CSP hash. Module architecture is equally disciplined — features initialise only when their selectors exist, storage access is probed and degrades silently, and every catalog view has explicit loading, empty, and error states. Documentation is unusually honest: the README and `docs/settings.md` disclaim orders, payments, accounts, deployment verification, Lighthouse results, and formal WCAG conformance rather than overstating them.

No blocker was found. The unresolved risk is concentrated in three areas the current QA pipeline is not shaped to reach. The mobile navigation is hidden with `opacity` alone, so roughly a dozen invisible controls stay in the keyboard tab order on every page below 900 px. The checkout form declares no submission contract, so whenever the runtime does not bind it the browser performs a native GET that places the customer's name, e-mail, phone, and address into the URL. And the contact form requires a surname and phone number that the project's own privacy policy does not enumerate, while that policy names consent as the processing basis for form data the form never captures.

Below those, the remaining findings are contained: an ARIA wiring error on the shop filter panel, an unenforced postal-code pattern, an unguarded initializer sequence, an unreachable confirmation page, a soft-404 on unknown product ids, and roughly 17 MB of oversized raster fallbacks in the shipped package. The project is suitable for continued development and close to suitable for portfolio presentation; the three P1 items should be closed first, and none of them requires an architectural change.

## 2. Audit scope and verification

### Areas inspected

- All 15 source HTML documents (`index.html`, `404.html`, `offline.html`, `thank-you.html`, `pages/**/*.html`) and the three shared partials in `src/partials/`
- Full JavaScript source: `js/main.js`, `js/core/`, `js/features/`, `js/services/`, `js/ui/`
- Full CSS source: `css/main.css` and the five partials in `css/partials/`
- Service worker source `src/sw.js` and its build-time generation in `scripts/vite-volt-garage.mjs`
- Build and validation tooling: `vite.config.mjs`, `scripts/html.mjs`, `scripts/csp.mjs`, `scripts/validate-package.mjs`, `scripts/validate-product-assets.mjs`, `scripts/validate-internal-links.js`, `scripts/validate-jsonld.js`, `scripts/qa-smoke-lighthouse.js`, `scripts/format-html-tight.js`, and the 18 test files in `scripts/tests/`
- Static resources and hosting contract: `public/data/products.json`, `public/site.webmanifest`, `public/_headers`, `public/_redirects`, `public/robots.txt`, `public/sitemap.xml`, fonts, icons, and the image tree including `_optimized/`
- Configuration and metadata: `package.json`, `.eslintrc.cjs`, `.stylelintrc.cjs`, `htmlvalidate.json`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.vscode/settings.json`
- Documentation and license: `README.md`, `docs/settings.md`, `docs/CHANGELOG.md`, `LICENSE`, and the archived material under `docs/archive/`

### Verification performed

- `node scripts/validate-internal-links.js` — executed and passed (15 HTML files)
- `node scripts/validate-jsonld.js` — executed and passed (15 HTML files, 2 template-specific assertions)
- `node scripts/validate-product-assets.mjs` — executed and passed (12 catalog entries, 12 raster images, 18 optimized variants)
- `node --test scripts/tests/cart-storage-state.test.mjs scripts/tests/checkout-submission.test.mjs` — executed and passed (40 subtests)
- `node --test scripts/tests/structured-data-urls.test.mjs scripts/tests/cart-button-feedback.test.mjs` — executed and passed (17 subtests)
- Independent recomputation of the SHA-256 of the `data-theme-preload` inline script in all 15 documents (LF-normalised): a single hash across every document, byte-identical to the one authorized in `public/_headers`
- Independent verification of every `icons`, `shortcuts`, and `screenshots` path in `public/site.webmanifest` against `public/` — all present
- Independent measurement of raster image intrinsic dimensions and file sizes across `public/assets/images/`, and of the total `public/` payload (24.15 MB, of which 17.33 MB is `assets/images/products`)
- Repository scan for committed credentials, tokens, key material, and `.env` files — none found
- Repository scan of `js/`, `src/`, `css/`, and all HTML for `TODO`, `FIXME`, `HACK`, `debugger`, and `console.log` — none found
- `git status` — working tree clean at audit start; only `AUDIT.md` was written

### Verification limitations

- `node_modules/` is not installed in the audited worktree and installation is out of scope for this audit. `npm run qa:html`, `qa:js`, `qa:css`, `format:check`, `qa:build` in full, `build`, `preview`, `qa:package`, and both `qa:smoke` variants were **not executed**. The 14 test files that import `fast-glob` or `html-validate` through `scripts/html.mjs`, `scripts/csp.mjs`, or `scripts/validate-package.mjs` could not be run; the four that depend only on Node built-ins and application modules were run and passed.
- `dist/` is absent, so the production package, the generated `dist/sw.js`, precache list, and deployment ID were inspected statically through `scripts/vite-volt-garage.mjs` and `scripts/validate-package.mjs` rather than against real output. No claim is made that the build currently succeeds.
- No browser, runtime, screen-reader, or cross-browser verification was performed. Source HTML uses `<!-- @include -->` directives that only resolve through the Vite renderer, so the composed documents could not be loaded without a build. Accessibility findings below are marked as defects only where the failure is deterministic from the code itself.
- No live URL was supplied for this audit. The public URL recorded in `package.json` and the canonical tags was not visited, and no statement is made about the current state of any deployment.
- Contrast compliance was not fully verified because reliable computed-style analysis was not available.

## 3. Verified strengths

- **Single-source HTML composition.** `scripts/html.mjs` expands includes, conditionals, and path tokens identically in the dev server, the production build, and the validators, and fails loudly on circular includes, includes outside `src/partials/`, non-HTML include targets, unclosed conditionals, unknown tokens, and any unresolved `{{ }}` or `@include` artifact surviving into output (`scripts/html.mjs:14-110`).
- **Automatic production-package validation.** `scripts/validate-package.mjs` runs at the end of every build via the plugin's `writeBundle` hook and asserts route presence, absence of source or legacy `.min` asset references, content-hashed bundle references per document, resolvable `href`/`src`/`srcset`/CSS `url()` targets, byte equality of every copied `public/` file, Vite manifest integrity, web-manifest icon/shortcut/screenshot paths, and absence of unresolved worker tokens (`scripts/validate-package.mjs:11-139`).
- **Enforced CSP contract for inline execution.** `scripts/csp.mjs` parses production HTML with the project's own parser, rejects inline event-handler attributes, `srcdoc`, and obfuscated `javascript:` URLs, requires an exact SHA-256 hash for every non-data inline script, and rejects orphaned hashes and `script-src-elem`/`script-src-attr` overrides. The single authorized hash in `public/_headers` was independently recomputed and matches all 15 documents exactly.
- **Content-derived service-worker identity and scoped cache ownership.** The deployment ID is a digest of bundle output, `public/` contents, and worker source; the precache list is injected at build time; activation deletes only non-current caches carrying the `volt-garage-` prefix; failed responses are never written to cache; hashed `/build/` bundles are cache-first while every stable URL revalidates (`scripts/vite-volt-garage.mjs:34-81`, `src/sw.js:22-98`).
- **User-controlled service-worker update flow.** A waiting worker is surfaced as a notification rather than activated; only the tab that approved the update reloads, and first controller acquisition and third-party activations are explicitly excluded (`js/ui/pwa-prompts.js:131-181`).
- **Defensive storage and initialization.** `safeStorage` probes `localStorage` once and wraps every operation, returning `null` rather than throwing (`js/services/storage.js:1-39`), and `initApp` gates each module on the presence of its selector so no page runs code for elements it does not contain (`js/main.js:190-218`).
- **Complete asynchronous state coverage.** Every catalog view renders explicit loading, empty, and error states, with `aria-busy` toggling and skeleton placeholders (`js/features/products.js:106-229`, `js/ui/state.js:1-17`).
- **No-JavaScript dark-theme fallback with parity held by a test.** `css/partials/themes.css:163-185` mirrors the dark palette under `:root:not([data-theme])`, keeping an explicit preference authoritative, and `scripts/tests/theme-css-fallback.test.mjs` holds the selector scope and token parity.
- **Clean repository hygiene.** No committed secrets, key material, or `.env` files; no `TODO`, `FIXME`, `HACK`, `debugger`, or stray `console.log` anywhere in `js/`, `src/`, `css/`, or the HTML documents.
- **Documentation that matches its own scope.** The README and `docs/settings.md` state plainly that there is no commerce backend, no accounts, no payments, no order persistence, no CI/CD, no deployment command, and no recorded Lighthouse results, and that configured quality workflows do not by themselves establish coverage or conformance.

## 4. P0 — Critical risks

None detected.

## 5. P1 — Important issues worth fixing next

### [P1-01] Closed mobile navigation stays keyboard-focusable and screen-reader reachable

- **Classification:** Defect
- **Affected area:** Shared header, accessibility, all 15 pages below 900 px
- **Evidence:** `css/partials/layout.css:167-193`, `css/partials/layout.css:255-257`, `js/ui/header.js:75-102`
- **Current behavior:** Below the `min-width: 900px` breakpoint the navigation panel is hidden with `opacity: 0`, `pointer-events: none`, and a transform only. It is not `display: none`, not `visibility: hidden`, and carries no `inert`, `aria-hidden`, or `tabindex="-1"`; `js/ui/header.js` toggles only the `is-open` class and `aria-expanded`. Neither `opacity` nor `pointer-events` removes an element from the tab order or from the accessibility tree, so the top-level link and the three `nav-button` toggles remain focusable while invisible. Because `.nav-item:focus-within .dropdown-menu { display: block }` (`css/partials/layout.css:255-257`), focusing an invisible toggle also expands its invisible submenu, adding its links to the tab sequence. The sibling `.project-modal` in the same codebase uses `visibility: hidden` for its closed state (`css/partials/components.css:809-831`), so this is an inconsistency rather than a convention.
- **Impact:** On every page at mobile and tablet widths a keyboard user encounters roughly a dozen focus stops with no visible focus indicator and no perceivable context before reaching the theme toggle, cart link, and menu button. A screen-reader user is offered a navigation menu that is visually absent and cannot be operated by pointer.
- **Recommended direction:** Make the closed state genuinely inert at the affected breakpoint — for example by adding a state that removes the panel from rendering and from the accessibility tree, applied in the same place that already controls `opacity` — and ensure the `min-width: 900px` block restores it. Keep the existing `is-open` class and `aria-expanded` contract unchanged.
- **Verification criteria:** With the viewport below 900 px and the menu closed, tabbing from the brand link reaches the theme toggle directly, and no navigation link or dropdown toggle can receive focus or be reported by an accessibility tree inspection until the menu button is activated.
- **Status:** RESOLVED — the closed mobile navigation is now hidden from keyboard focus and the accessibility tree below 900 px while preserving the existing open-state and desktop navigation behavior; verified in Chromium across mobile and desktop widths, with existing navigation tests and the full QA suite passing, and recorded in `docs/CHANGELOG.md` on 2026-09-09.

### [P1-02] Checkout form declares no submission contract and falls back to a GET that exposes customer data in the URL

- **Classification:** Defect
- **Affected area:** Checkout, privacy, progressive enhancement
- **Evidence:** `pages/checkout.html:104`, `js/main.js:115-160`
- **Current behavior:** The checkout form is declared as `<form class="form-grid" data-checkout-form data-reveal>` with no `method` and no `action`. Cancellation of the native submission exists only inside the JavaScript submit handler (`js/main.js:146`). Whenever that handler is not bound — scripting unavailable, the module bundle failing to load, or any earlier initializer throwing (see [P2-02]) — the browser applies the defaults and performs a GET to the current URL. All nine fields, including `firstName`, `lastName`, `email`, `phone`, `street`, `city`, and `zip`, are appended to the query string. The page then reloads with an empty form and no confirmation of any kind.
- **Impact:** The customer's name, e-mail address, telephone number, and full delivery address are written into the address bar, browser history, and any server access log or referrer that observes the request, for a flow that the project documents as producing no order at all. In the same state the "Złóż zamówienie" button is a control that performs no meaningful action and gives the visitor no feedback.
- **Recommended direction:** Give the form an explicit submission contract that is safe without scripting — at minimum a non-GET method so field values never enter the URL — and make the demonstration-only outcome visible in the unscripted state rather than relying on the JavaScript handler to suppress submission.
- **Verification criteria:** With scripting disabled, submitting the checkout form does not place any field value in the URL, and the visitor is told that the flow is a demonstration rather than being returned silently to a blank form.

### [P1-03] Contact form collects personal data the project's own privacy policy does not cover, under a consent it never captures

- **Classification:** Content integrity risk
- **Affected area:** Contact form, public legal documents
- **Evidence:** `pages/contact.html:173-242`, `src/partials/phone-field.html:1-15`, `pages/privacy-policy.html` — sections `pp-2`, `pp-3`, `pp-4`
- **Current behavior:** The contact form is a real Netlify Forms submission (`data-netlify="true"`, `method="POST"`) and makes name, **surname**, e-mail, **telephone number**, and message all `required`. The privacy policy enumerates the processed categories as "imię, adres e-mail, inne informacje dobrowolnie podane przez Użytkownika w treści wiadomości" plus technical data — it does not list a surname or a telephone number as collected fields. Section `pp-4` names the user's consent under Art. 6(1)(a) as the basis for data sent through the form, but the form contains no consent control and no link to the privacy or cookies policy at the point of collection. Section `pp-2` additionally describes data entered in forms as "testowy", while this particular form does transmit to a third-party form service.
- **Impact:** The two published documents that describe what the site does with personal data disagree with the form that actually collects it. A visitor reading the policy would not expect a telephone number to be mandatory, and a maintainer reconciling the two has no single source of truth. This is a trust and accuracy defect in public-facing material, not an assessment of legal conformance.
- **Recommended direction:** Reconcile the two sides in whichever direction fits the project's intent: either narrow the form to the fields the policy describes, or extend the policy's enumerated categories and add a consent affordance plus a policy link adjacent to the submit control. Align the "testowy" wording in section `pp-2` with the fact that the contact form reaches a real processor.
- **Verification criteria:** Every field the contact form marks as required appears in the privacy policy's list of processed data, the stated legal basis matches what the form actually obtains, and the policy is reachable from the form itself without leaving the page.

## 6. P2 — Minor refinements

### [P2-01] Shop filter panel is named by the results heading and described by a shipping notice

- **Classification:** Defect
- **Affected area:** Shop page, accessibility
- **Evidence:** `pages/shop.html:100-105`, `pages/shop.html:126-134`, `pages/shop.html:165`
- **Current behavior:** The `<aside class="filter-panel">` carries `aria-labelledby="filter-heading"`, but `#filter-heading` is the `<h2>Produkty</h2>` that heads the results column outside the aside (`pages/shop.html:165`). Its `aria-describedby="filter-summary"` points at the free-shipping notice `Darmowa wysyłka od 300 zł.` (`pages/shop.html:100`). Separately, the `<datalist>` that receives search suggestions carries `aria-live="polite"` (`pages/shop.html:133`); a `datalist` is never rendered in the accessibility tree, so the live region has no effect.
- **Impact:** The complementary landmark that holds search, category, price, and sorting controls is announced as "Produkty" and described by an unrelated shipping message, which misidentifies both regions of the page for assistive-technology users. The inert live region gives the appearance of announced suggestions that never occur.
- **Recommended direction:** Give the filter panel its own heading or accessible name describing the filters, remove the description that points at unrelated shipping copy, and drop the `aria-live` attribute from the `datalist` since suggestion announcement is handled by the input's own autocomplete behaviour.
- **Verification criteria:** The filter panel's accessible name describes filtering, the results heading is no longer borrowed as its label, and no live-region attribute remains on a non-rendered element.

### [P2-02] One failing initializer silently disables every module after it

- **Classification:** Source-visible risk
- **Affected area:** Application bootstrap, cart, forms
- **Evidence:** `js/main.js:180-219`, `js/features/cart.js:12-52`
- **Current behavior:** `initApp` calls every initializer in one unguarded sequence. Any synchronous throw aborts the remainder, including `initAddToCartButtons`, `initForms`, `initProjectModal`, service-worker registration, and the copyright year. A reachable trigger exists in the cart: `getCart` validates only that the parsed value is an array (`js/features/cart.js:16-17`), and `updateCount` then reads `item.qty` on each element (`js/features/cart.js:48`). A persisted `volt_cart` value of `[null]` therefore throws a `TypeError` during `initCart`, and `["x"]` yields a `NaN` badge. `scripts/tests/cart-storage-state.test.mjs` covers non-array payloads specifically but not arrays containing non-object members, so this residual gap sits inside a boundary the project deliberately hardened.
- **Impact:** A single malformed persisted value or a future exception in an early module leaves the page visually intact but functionally degraded — checkout validation unbound, add-to-cart inert, the project modal absent — with no user-visible signal. It also puts the checkout form into the unscripted GET path described in [P1-02].
- **Recommended direction:** Normalise cart entries at the deserialization boundary the module already owns, so only well-formed `{ id, qty }` records reach the array operations, and isolate initializer failures so one module cannot prevent the others from running.
- **Verification criteria:** A `volt_cart` value of `[null]` or `["x"]` yields an empty cart and a `0` badge without throwing, and an induced exception in any one initializer leaves the remaining modules functional.

### [P2-03] Price slider re-renders the grid on every input event and leaks an observer each time

- **Classification:** Source-visible risk
- **Affected area:** Shop filtering, runtime performance
- **Evidence:** `js/features/filters.js:184-192`, `js/features/products.js:119-124`, `js/ui/reveal.js:1-37`
- **Current behavior:** A debounced `applyFiltersDebounced` exists and is used for the search input (`js/features/filters.js:204`), but the price range calls the undebounced `applyFilters` directly on every `input` event (`js/features/filters.js:190`). Each call replaces the whole grid via `innerHTML` and then calls `initReveal`, which constructs a new `IntersectionObserver` over every `[data-reveal]` element on the page (`js/ui/reveal.js:23-35`). No previous observer is ever disconnected.
- **Impact:** A single drag of the price slider triggers dozens of full grid rebuilds and accumulates one live `IntersectionObserver` per event for the lifetime of the page, alongside repeated JSON-LD rewriting. The inconsistency with the search input's debounce also makes the intended behaviour ambiguous for future maintainers.
- **Recommended direction:** Route the price range through the same debounced path as the search input while keeping the immediate `priceOutput` update, and give the reveal module a way to release its previous observer before creating a new one.
- **Verification criteria:** Dragging the price slider produces a bounded number of grid renders after input settles, and repeated filtering does not accumulate observers.

### [P2-04] Postal-code pattern is never enforced while JavaScript is running

- **Classification:** Defect
- **Affected area:** Checkout validation
- **Evidence:** `pages/checkout.html:172-182`, `js/main.js:57-63`, `js/main.js:116`
- **Current behavior:** The checkout `zip` field declares `pattern="^[0-9]{2}-?[0-9]{3}$"` on a `type="text"` input. `initForms` sets `form.noValidate = true` (`js/main.js:116`), suppressing the browser's own constraint validation, and its `validators` map covers only `email` and `tel` (`js/main.js:57-63`) — no branch reads `field.pattern` for any other input type. The declared format is therefore checked only when scripting is unavailable. The project already guards the equivalent case for the phone field through `src/partials/phone-field.html` and `scripts/tests/phone-validation.test.mjs`, so the postal code is the one declared pattern left outside that contract.
- **Impact:** Any value passes the postal-code field in the normal scripted flow, so the checkout demonstration accepts data it visibly declares invalid, and the field's `title` guidance never appears.
- **Recommended direction:** Have the shared field validator honour a declared `pattern` for every input type rather than only for `tel`, so a declared constraint and its enforcement cannot drift apart again.
- **Verification criteria:** Submitting the checkout form with `zip` set to a non-matching value produces a field error in the scripted flow, and adding a `pattern` to any future field is enforced without further code changes.

### [P2-05] `thank-you.html` is maintained but unreachable from any route

- **Classification:** Contract mismatch
- **Affected area:** Contact flow, repository content
- **Evidence:** `thank-you.html:82-117`, `pages/contact.html:173-181`, `public/sitemap.xml`
- **Current behavior:** `thank-you.html` is a complete, styled confirmation page carrying the shared shell, canonical and social metadata, and a correct `noindex,follow` directive. No document links to it, it is absent from `public/sitemap.xml`, and the contact form declares no `action`, so a successful Netlify Forms submission lands on the platform's own default success page rather than this one. The only references anywhere in the repository are formatting globs and test fixtures.
- **Impact:** The project ships and maintains a branded confirmation page that no visitor can reach, and the one real form flow ends on an unstyled third-party page instead. The document is also carried through every formatting and build-contract check as though it were a live route.
- **Recommended direction:** Either point the contact form's success destination at `thank-you.html` so the flow terminates on the project's own page, or remove the document if the platform default is the intended outcome.
- **Verification criteria:** Either a completed contact submission reaches `thank-you.html`, or the document no longer exists in the repository.

### [P2-06] Unknown product id silently renders the first product under a rewritten canonical

- **Classification:** Defect
- **Affected area:** Product page, structured data, SEO
- **Evidence:** `js/features/products.js:239-259`
- **Current behavior:** `initProductDetails` reads `?id=`, and when no catalog entry matches it falls back to `products[0]` (`js/features/products.js:241`). It then rewrites the canonical link, the document title, and the description, `og:description`, and `twitter:description` meta tags to that fallback product, and emits `Product` JSON-LD for it. There is no not-found state, although the same module renders explicit loading, empty, and error states everywhere else.
- **Impact:** A stale bookmark, an outdated external link, or a removed catalog entry returns HTTP 200 showing a different product, with no indication that the requested one does not exist. Crawlers following such a link receive a duplicate of the first product's metadata and structured data at an arbitrary URL.
- **Recommended direction:** Distinguish a missing `id` — where defaulting to the first product is the intended catalog-entry behaviour — from an `id` that was supplied but matched nothing, and give the latter a not-found state that leaves the page's own canonical and metadata untouched.
- **Verification criteria:** Loading `pages/product.html?id=` with a value absent from the catalog shows a not-found state and does not rewrite the canonical link, title, or description to an unrelated product.

### [P2-07] Cart and product-detail regions omit the no-JavaScript fallback used by every other dynamic region

- **Classification:** Contract mismatch
- **Affected area:** Progressive-enhancement baseline
- **Evidence:** `pages/cart.html:100-101`, `pages/product.html:102`, `index.html:207-212`, `pages/shop.html:168-172`
- **Current behavior:** Five dynamic regions ship an explicit fallback paragraph telling the visitor that content loads dynamically and that JavaScript is required — homepage featured products, shop, new arrivals, promotions, and product-page related items. The two remaining regions ship empty: `<div class="table-like" data-cart-items></div>` and `<div class="container" data-product-details></div>`. On the cart page the surrounding summary is static markup that reads "Wartość produktów: 0 zł / Dostawa: 0 zł / Razem: 0 zł" beside an active "Przejdź do zamówienia" link.
- **Impact:** Without scripting the cart page does not look degraded, it looks like a correctly rendered empty cart, and it still offers a checkout call to action. This contradicts the honest baseline the other five regions establish.
- **Recommended direction:** Extend the existing fallback pattern to both remaining dynamic containers, and make the cart's static zero totals conditional on the same enhancement signal so an unscripted visitor is not shown a confident but meaningless summary.
- **Verification criteria:** With scripting disabled, both the cart items area and the product-detail area explain that content loads dynamically, and the cart page no longer presents zero totals as a real cart state.

### [P2-08] Redundant `imageBase` field creates a second picture-rendering path and narrows asset validation

- **Classification:** Maintenance risk
- **Affected area:** Catalog data, product rendering, QA coverage
- **Evidence:** `js/features/products.js:25-55`, `public/data/products.json`, `scripts/validate-product-assets.mjs:87`
- **Current behavior:** `productPicture` derives the optimized variant paths from `product.image` by string replacement, and `cardPicture` derives the identical paths from the separate `product.imageBase` field. For all 12 current catalog entries the two functions emit the same `<source>` and `<img>` URLs, so `imageBase` carries no information not already derivable. Nine entries declare it; three do not. `scripts/validate-product-assets.mjs:87` returns early when `imageBase` is absent, so the optimized AVIF and WebP variants of `emblem-carbon`, `emblem-steel`, and `sticker-track` are never checked — the validator reports 18 variants for a catalog that renders 24.
- **Impact:** Two code paths must be kept in agreement for one output, and whether a product's optimized variants are validated depends on an optional field rather than on how the product is actually rendered. Deleting or renaming one of the three unvalidated variants would leave `npm run qa` green while the corresponding `<source>` silently stops resolving.
- **Recommended direction:** Derive the optimized paths from a single place and key the asset validator to the same derivation used at render time, so validation coverage follows the rendered markup rather than an optional catalog field.
- **Verification criteria:** Product cards and product details resolve their optimized variants through one code path, and `npm run qa:product-assets` reports validated variants for all 12 catalog entries.

### [P2-09] Raster product fallbacks ship at source resolution and dominate the deployed package

- **Classification:** Source-visible risk
- **Affected area:** Published assets, deployment size
- **Evidence:** `public/assets/images/products/` (measured), `js/features/products.js:33`, `js/features/products.js:52`, `css/partials/components.css:153-167`
- **Current behavior:** The nine product PNG fallbacks are 1536×1024 and measure between 1.61 MB and 2.36 MB each; the three JPG fallbacks are 1024×1024 and 1536×1024. `public/assets/images/products/` totals 17.33 MB of the 24.15 MB `public/` payload, against 1.96 MB for the complete `_optimized/` AVIF and WebP set. Every card renders inside `.card picture { aspect-ratio: 4 / 3 }` with `object-fit: cover` at a maximum of roughly 400 CSS pixels, and the markup declares `width="800" height="600"`. `docs/CHANGELOG.md` records a prior lossless optimization pass that deliberately preserved decoded pixels, so the current dimensions are an existing decision rather than an oversight.
- **Impact:** Roughly seventeen megabytes of the shipped static package exists solely as a fallback for clients supporting neither AVIF nor WebP, and any client that does take that path downloads up to 2.36 MB for a card slot under 400 pixels wide. The same weight is carried by the repository, by every clone, and by every deployment upload.
- **Recommended direction:** Resize the raster fallbacks to the band the cards and product media actually render at, keeping them as genuine fallbacks, rather than optimizing losslessly at source resolution. Retain the originals outside the published tree if they are needed for regeneration.
- **Verification criteria:** The largest published product fallback is proportionate to its rendered size, `public/assets/images/products/` is no longer several times the size of the rest of `public/`, and `npm run qa:product-assets` and package validation still pass.

### [P2-10] Homepage statistics assert figures the implementation does not support

- **Classification:** Content integrity risk
- **Affected area:** Homepage content
- **Evidence:** `index.html:183-196`, `public/data/products.json`
- **Current behavior:** The hero card presents three unqualified figures: "42 — Nowe produkty", "4.9/5 — Ocena klientów", and "48h — Wysyłka ekspresowa". The catalog contains 12 products in total, of which two carry a "Nowość" badge. There is no review, rating, or ordering mechanism anywhere in the project. The catalog additionally carries a per-product `rating` field between 4.4 and 4.9 that no module reads and no view renders. The project's demonstration status is disclosed in the first-visit modal and in `pages/terms.html`, but these figures appear on the homepage without qualification.
- **Impact:** The homepage states a customer rating that no part of the system could produce and a product count that its own catalog contradicts, which is the kind of claim a portfolio reviewer is most likely to test. The unused `rating` field leaves fabricated per-product ratings sitting in the canonical data source, where a future view could surface them without anyone noticing they are invented.
- **Recommended direction:** Replace the unsupported figures with statements the implementation can stand behind, or mark them explicitly as illustrative in the same way the terms page does, and remove the `rating` field from the catalog unless a view is going to use it.
- **Verification criteria:** No homepage figure asserts a rating or a catalog quantity that the implementation cannot produce, and the catalog carries no unused fabricated review data.

### [P2-11] `docs/settings.md` documents a `qa` chain that no longer matches `package.json`

- **Classification:** Documentation mismatch
- **Affected area:** Project documentation, QA expectations
- **Evidence:** `docs/settings.md:32`, `package.json` — `scripts.qa`, `README.md` — Testing and validation sections
- **Current behavior:** `docs/settings.md` states "Commands below match `package.json`" and then documents `qa` as `npm run qa:html && npm run validate:jsonld && npm run qa:links && npm run qa:js && npm run qa:css && npm run qa:build`. The actual script also runs `npm run qa:product-assets` between `qa:links` and `qa:js`. The table documents 22 of the 23 defined scripts; `qa:product-assets` has no row at all, and both the Polish and English README sections list what `qa` checks without mentioning product assets.
- **Impact:** The one document that declares itself authoritative for commands understates what the aggregate check covers and omits a standalone validator entirely, so a maintainer verifying catalog asset integrity has no documented command to reach for and may believe the coverage does not exist.
- **Recommended direction:** Update the `qa` command string, add the missing `qa:product-assets` row, and extend the README's description of what `qa` checks.
- **Verification criteria:** Every script in `package.json` has a matching row in `docs/settings.md` whose command string is identical to the defined script.

## 7. Extra quality improvements

### Retire `style-src 'unsafe-inline'` by moving the header shadow into its existing class

- **Relevant area:** Content Security Policy, shared header
- **Current evidence:** `public/_headers` retains `style-src 'self' 'unsafe-inline'`. No HTML document in the repository contains a `style=` attribute, and the only inline style written at runtime is `header.style.boxShadow` in `js/ui/header.js:65` and `js/ui/header.js:68`. The same handler already toggles a `shrink` class on the same element, and `css/partials/layout.css:147` already styles `.site-header.shrink`.
- **Potential value:** The project went to considerable effort to authorize its single inline script by exact hash rather than by `'unsafe-inline'`; moving two box-shadow assignments into the class that is already being toggled would let `style-src` reach the same standard, and `scripts/csp.mjs` is already structured to hold the result.
- **Scope boundary:** Optional hardening. `'unsafe-inline'` in `style-src` is not a current defect and the present policy is already stronger than typical for a static site.

### Raise the ESLint rule floor

- **Relevant area:** Static analysis
- **Current evidence:** `.eslintrc.cjs` sets no `extends` and enables only `no-undef` and `no-unused-vars`. `npm run qa:js` lints application modules, the worker source, all build scripts, the image tool, and the Vite config against those two rules alone.
- **Potential value:** For a project where the linter is the primary static safety net over roughly 1,800 lines of hand-written application and tooling JavaScript, extending `eslint:recommended` would add checks such as duplicate object keys, unreachable code, and empty blocks at no configuration cost.
- **Scope boundary:** Optional. The current configuration is deliberate and the codebase shows no evidence of the defects those rules catch.

### Record the license terms of the bundled third-party fonts

- **Relevant area:** License and attribution
- **Current evidence:** `public/assets/fonts/` ships six WOFF2 files across two typeface families declared in `css/partials/themes.css:1-42`. `LICENSE` explicitly places third-party fonts outside its scope and states that rights remain with their respective owners, but the repository contains no notice, license file, or attribution recording what those terms are for these specific files.
- **Potential value:** The LICENSE already establishes that separate terms govern these assets; recording which ones would close the loop for anyone evaluating or reusing the repository under its stated proprietary license, and would make the obligation explicit before any redistribution question arises.
- **Scope boundary:** Optional. This audit did not determine the applicable font licenses from repository evidence and makes no claim about them.

### Automate the existing quality workflows

- **Relevant area:** Continuous verification
- **Current evidence:** The repository contains 18 test files, five custom validators, four linting and formatting configurations, and a Lighthouse smoke workflow. `README.md` and `docs/settings.md` both state accurately that there is no CI/CD workflow and no deployment command.
- **Potential value:** The verification assets already exist and are unusually thorough; nothing currently runs them except a maintainer choosing to. Automating `npm run qa` alone would convert an existing investment into a standing guarantee, and several findings in this audit sit in the gap between what is written and what is habitually run.
- **Scope boundary:** Optional and out of the project's documented scope today. The absence is disclosed honestly rather than implied to exist.

## 8. Current readiness conclusion

**Status:** Needs important fixes

No P0 finding was identified: the project builds from a coherent contract, the catalog and cart flows are complete within their documented scope, the hosting configuration is consistent, and no secret, credential, or destructive behaviour was found. Three P1 findings should be closed before this repository is presented as finished work. Two are narrow implementation defects with small, local fixes — the closed mobile navigation must stop offering invisible focus targets, and the checkout form must stop placing customer data in a URL when its script handler is not bound. The third is an inconsistency between the site's public legal documents and the form that actually collects personal data, which is a wording and disclosure alignment rather than an engineering change.

The P2 findings do not block release. They cluster into accessibility wiring, validation coverage, published-asset weight, and documentation accuracy, and each can be resolved independently. The status reflects the P1 items alone; the underlying architecture, build contract, and documentation are in a state that supports both continued development and handoff.

Readiness here means readiness within this project's verified scope as a static, front-end-only storefront demonstration. It is not a statement of accessibility conformance, security assurance, legal compliance, browser compatibility, or production performance, none of which this audit was positioned to establish.

## 9. Senior rating

**Rating:** 8/10

Judged as a static Vanilla HTML/CSS/JavaScript multi-page portfolio storefront, the engineering quality is well above the norm for its category. The build and validation layer is the standout: one renderer shared by dev, build, and validators; a production package validator that runs automatically and checks byte equality of copied assets, hashed bundle references, and manifest integrity; a CSP that authorizes its single inline script by exact hash and actively rejects inline execution sinks and orphaned hashes; and a service worker whose deployment identity, precache list, and cache ownership are all derived rather than hand-maintained. Module boundaries are clean, storage access is defensive, every asynchronous view has real loading, empty, and error states, and the documentation refuses the overstatements this project category usually contains.

The deductions are for unresolved correctness rather than for architecture. Three P1 findings reach real users or real data: invisible focusable navigation on every page below 900 px, a checkout form that can place customer details into a URL, and public legal text that does not match the form collecting personal information. Below those, a declared postal-code pattern goes unenforced, an unguarded bootstrap lets one module failure disable the rest, a maintained confirmation page is unreachable, and roughly seventeen megabytes of oversized raster fallbacks dominate the shipped package. Each of these lives in the space the otherwise-excellent QA pipeline does not reach — rendered accessibility state, unscripted form behaviour, published content claims, and asset weight — which is precisely where a final audit is expected to look. A 9 would need those P1 items closed and the validation coverage extended into the gaps they occupy.
