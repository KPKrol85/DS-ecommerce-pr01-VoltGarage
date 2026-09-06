# Volt Garage — Development Plan

**Last reviewed:** 2026-09-06

**Project type:** Static Vanilla HTML/CSS/JavaScript multi-page storefront demo, built and previewed with Vite 8, published as static output to Netlify

**Plan status:** Active

## Planning principles

- This plan reflects the current verified repository state and the findings recorded in `daily-AUDIT.md` (2026-09-06), each re-verified against the current source before inclusion.
- Main items are checked only after all required subtasks and the stated completion condition are satisfied.
- Canonical HTML, `src/partials/`, CSS, JavaScript, `public/` resources, and build scripts are changed at source; `dist/` and the generated `dist/sw.js` are regenerated and never edited manually.
- Significant completed changes are recorded in `docs/CHANGELOG.md`; no completed plan items are reconstructed here, because the previous pre-Vite plan was removed together with the pre-Vite audit and contained no completed items.
- Browser, Service Worker, Netlify delivery, and Netlify Forms behavior is claimed only after the relevant verification is actually run.
- The project is a demonstrational front-end with no commerce backend, accounts, payments, or order persistence. Work is planned against that documented scope, not against a full commerce platform.

## Current priorities

1. `PH1-01` — Repair and validate the product image contract.
2. `PH1-02` — Resolve runtime structured-data URLs against the current document.
3. `PH1-03` — Make the fallback documents recoverable from any URL.
4. `PH2-01` — Correct the shared phone validation pattern.
5. `PH3-01` — Settle one Service Worker update contract.

## Phase 1 — Runtime link and asset integrity

**Goal:** Every reference the application produces at runtime, and every link in a document served at an arbitrary URL, resolves to real content.

- [x] **PH1-01 — Repair and validate the product image contract** — **Priority:** High
  - [x] correct the `interior-mat` entry in `public/data/products.json` so its `image` value points at the raster that exists (`wnetrze-02.png`)
  - [x] add product-data asset checking to the `scripts/` validators — extended into an existing validator, or as a new `scripts/validate-product-assets.mjs` — asserting that every `image` path and every `_optimized` variant derived from `imageBase` resolves to a file
  - [x] wire the check into the `qa` script in `package.json` without weakening the existing members
  - [x] confirm the corrected reference in the cart `<img>` built by `js/features/cart.js`, and in the `Product` and `ItemList` image URLs built from the same field
  - **Completion condition:** every asset path declared in the catalog resolves in source, and a missing declared asset fails `npm run qa`.
  - **Source:** `daily-AUDIT.md` — P1-01, and the product-data half of "Extend validation to product-data asset paths and runtime-generated URLs"

- [x] **PH1-02 — Resolve runtime structured-data URLs against the current document** — **Priority:** High
  - [x] change the resolution base in `toAbsolute` (`js/ui/structured-data.js`) from `window.location.origin` to the current document URL, so relative hrefs keep their directory
  - [x] verify the resulting `ItemList` item URLs on `pages/shop.html`, `pages/new-arrivals.html`, and `pages/promotions.html`, where `getProductLink()` returns `product.html?id=…` and the deployed route is `/pages/product.html?id=…`
  - [x] confirm that breadcrumb and image URLs, which currently resolve correctly only because their `../` prefix collapses at the root, remain correct under the new base
  - **Completion condition:** every URL injected into runtime JSON-LD from a `pages/` document resolves to the route that document actually links to.
  - **Source:** `daily-AUDIT.md` — P1-02

- [ ] **PH1-03 — Make the fallback documents recoverable from any URL** — **Priority:** High
  - [ ] give `404.html` and `offline.html` root-absolute link targets, consistent with their already root-absolute CSS, font, icon, and manifest references
  - [ ] cover the links these documents inherit from `src/partials/header.html` and `src/partials/footer.html`, which render document-relative because `rootPrefix` and `pagesPrefix` are computed from document depth in `scripts/html.mjs`
  - [ ] make the primary action in `offline.html` re-request the failed navigation instead of linking to `offline.html` itself
  - [ ] verify against a path below the root — the catch-all in `public/_redirects` serves `404.html` at any unmatched path, and `src/sw.js` returns the offline document while the browser keeps the requested URL
  - **Completion condition:** from a miss such as `/pages/typo.html`, every navigation control on both fallback documents leads to the intended page, and the offline retry re-attempts the original request.
  - **Source:** `daily-AUDIT.md` — P1-03, P2-07

## Phase 2 — Public form contracts

**Goal:** Every public form accepts the formats the site itself prints, and reports only the outcome it actually performs.

- [x] **PH2-01 — Correct the shared phone validation pattern** — **Priority:** High
  - [x] fix the doubled backslash in the `tel` pattern in `pages/contact.html` and `pages/checkout.html`, so the character class matches whitespace rather than a literal backslash and the letter `s`
  - [x] keep the two occurrences derived from one definition so they cannot drift; `js/main.js` sets `form.noValidate` and re-tests the same attribute with `new RegExp(field.pattern)`
  - [x] give the rejection message enough formatting guidance to be actionable
  - [x] verify that the formats the project prints in its own footer and contact page pass both the attribute and the JavaScript layer
  - **Completion condition:** the required phone field accepts the space-separated and prefixed formats the project publishes, and both validation layers agree.
  - **Source:** `daily-AUDIT.md` — P1-04

- [x] **PH2-02 — Give the homepage newsletter control an honest outcome** — **Priority:** High
  - [x] decide the outcome for the newsletter section in `index.html`: route it through the same validated, demonstration-only flow the checkout uses, or remove the email-entry and submit affordance so nothing implies an address is registered
  - [x] if the validated flow is chosen, add the form hook `js/main.js` binds, a `name` attribute on the required email input, and a status region consistent with the other forms
  - [x] keep the wording inside the documented project scope — the repository contains no subscription destination, and introducing one is a separate product decision outside the current scope
  - [x] verify that submitting no longer performs a default GET that reloads the homepage and discards the address
  - **Completion condition:** the rendered section performs exactly one verified outcome and never falls through to a meaningless default form navigation.
  - **Source:** `daily-AUDIT.md` — P1-05

- [ ] **PH2-03 — Guard checkout submission on a non-empty cart** — **Priority:** Medium
  - [ ] block the checkout success path in `js/main.js` when the stored cart is empty, and report that state in the form status region
  - [ ] word the confirmation so it does not claim more than the simulated flow performs, matching how `README.md` already describes checkout
  - [ ] verify with an empty cart, where `initCheckoutSummary` in `js/features/cart.js` renders `0 zł` across all three summary lines
  - **Completion condition:** a valid submission with nothing in the cart is refused with a clear message, and the accepted-submission message states only what the demonstration performs.
  - **Source:** `daily-AUDIT.md` — P2-06

## Phase 3 — Service Worker update contract

**Goal:** The worker, the update prompt, and the documentation describe one update-activation behavior.

- [ ] **PH3-01 — Settle one Service Worker update contract** — **Priority:** High
  - [ ] choose one contract: either remove `self.skipWaiting()` from the `install` handler in `src/sw.js` so the update prompt controls activation, or remove the prompt path and keep immediate activation
  - [ ] align `js/ui/pwa-prompts.js` with the choice — its update toast posts `SKIP_WAITING` to `registration.waiting`, which cannot exist while the worker skips waiting during install
  - [ ] guard the `controllerchange` reload against the first-install transition, where the controller changes from none to the worker claimed in `activate`
  - [ ] update the PWA passages in `README.md` and the Service Worker notes in `docs/settings.md` to describe the contract that ends up implemented
  - [ ] verify update and first-install behavior against a production build served through `npm run preview`, since registration is disabled in dev
  - **Completion condition:** one update contract is implemented in the worker, the prompt, and the documentation, and no page reload occurs without user action.
  - **Source:** `daily-AUDIT.md` — P1-06

## Phase 4 — Shared shell correctness and interaction quality

**Goal:** The shared header and footer, and the catalog controls, describe their destinations and state correctly across all 15 documents.

- [ ] **PH4-01 — Align shared navigation labels with their destinations** — **Priority:** Medium
  - [ ] resolve the "Dostawa" and "Zwroty" entries in `src/partials/header.html` and `src/partials/footer.html`, which currently link to `checkout.html` and `cart.html`
  - [ ] either point them at content that answers them or remove them until such content exists; adding a route also requires updating `public/sitemap.xml`, manifest shortcuts, and the smoke scope where relevant
  - [ ] run `npm run qa:links` after the change
  - **Completion condition:** no shared navigation entry names a topic its destination does not contain.
  - **Source:** `daily-AUDIT.md` — P2-01

- [ ] **PH4-02 — Repair the document heading outline** — **Priority:** Medium
  - [ ] align the four footer column headings in `src/partials/footer.html` with the level the surrounding page outline actually reaches, instead of a fixed `<h4>`
  - [ ] resolve the two in-page skips where an `<h3>` precedes any `<h2>`: the hero card in `index.html` and the summary panel in `pages/cart.html`
  - [ ] re-scan heading levels across all 15 rendered documents, including `404.html`, `offline.html`, `thank-you.html`, and `pages/collections.html`, where the current jump is `h1` to `h4`
  - **Completion condition:** no rendered document skips a heading level between its own outline and the shared footer.
  - **Source:** `daily-AUDIT.md` — P2-02

- [ ] **PH4-03 — Give the theme toggle a stable accessible name** — **Priority:** Medium
  - [ ] stop overwriting the toggle's `aria-label` with the theme value in `reflectPreference` (`js/ui/theme.js`) and give the control a persistent descriptive name in `src/partials/header.html`
  - [ ] let `aria-pressed` carry the state, and reconsider `aria-live="polite"` on the interactive control itself
  - [ ] verify the announced name and pressed state after toggling in both directions
  - **Completion condition:** the control is announced by what it does rather than by the current theme value, on every page.
  - **Source:** `daily-AUDIT.md` — P2-03

- [ ] **PH4-04 — Keep the add-to-cart button label restorable** — **Priority:** Low
  - [ ] in `initAddToCartButtons` (`js/features/cart.js`), capture the original label once per button or reset the pending timeout on each click, so a second click inside the 1200 ms window cannot capture the confirmation text
  - [ ] verify by activating one card's button twice in quick succession and confirming the label and accessible name return to the original
  - **Completion condition:** repeated activation never leaves the button permanently showing the confirmation label.
  - **Source:** `daily-AUDIT.md` — P2-04

## Phase 5 — Public content and catalog consistency

**Goal:** Public content matches the catalog and the filters it sends visitors to.

- [ ] **PH5-01 — Resolve the Detailing category** — **Priority:** Low
  - [ ] decide whether Detailing becomes a real category in `public/data/products.json` and in `#filter-category` in `pages/shop.html`, or is presented as part of Gadżety
  - [ ] apply the decision to the Detailing card in `pages/collections.html`, which currently links to the same filtered result as the Gadżety card
  - [ ] apply the same decision to the non-interactive Detailing pill in `index.html`
  - **Completion condition:** every category presented to visitors exists in the catalog and in the shop filter, and no two collection cards resolve to the same filtered result.
  - **Source:** `daily-AUDIT.md` — P2-05

- [ ] **PH5-02 — Remove the duplicated hero statistic** — **Priority:** Low
  - [ ] replace the repeated figure and label in the first two `.stat` blocks of the `index.html` hero card with the intended second statistic, or reduce the grid to three items
  - **Completion condition:** the homepage hero stats grid shows no duplicated figure.
  - **Source:** `daily-AUDIT.md` — P2-08

## Phase 6 — Repository and documentation contracts

**Goal:** The published package and the documents describing it match the current repository inventory.

- [ ] **PH6-01 — Remove unreferenced and duplicated published assets** — **Priority:** Medium
  - [ ] remove the two accidentally committed shortcut directories under `public/assets/icons/shortcuts/` after confirming `public/site.webmanifest` uses only the three canonical files directly under `shortcuts/`
  - [ ] remove the unreferenced hero sets `hero-01` through `hero-04` from both `public/assets/images/hero/` and `public/assets/images/_optimized/hero/`; only `hero-05` is referenced, from `index.html`
  - [ ] remove the remaining unreferenced files — `public/assets/images/og/og-1200x1200.jpg`, `public/assets/icons/favicon/favicon-96x96.png`, the `_optimized/products/zewnetrze-02` pair whose name sits one character from the real `zewnetrzne-02` variants, and the six unused SVGs directly under `public/assets/images/` — or record in `docs/settings.md` why each is retained
  - [ ] run `npm run build` afterwards so `scripts/validate-package.mjs` confirms the manifest icon, shortcut, and screenshot paths still resolve
  - **Completion condition:** every file copied from `public/` into `dist/` is either referenced by the project or documented as intentionally retained.
  - **Source:** `daily-AUDIT.md` — P2-09

- [ ] **PH6-02 — Remove the stale `humans.txt` references** — **Priority:** Medium
  - [ ] remove the four `humans.txt` passages in `README.md` and the one in `docs/settings.md` that still describe it as a tracked `public/` file and as part of `dist/`
  - [ ] drop the leftover `humans.txt` entry from the public-file fixture in `scripts/tests/build-contract.test.mjs`
  - [ ] run `npm run qa:build` to confirm the package-contract tests still pass
  - **Completion condition:** no tracked file describes `humans.txt` as part of the repository or the deployment package.
  - **Source:** `daily-AUDIT.md` — P2-10

- [ ] **PH6-03 — Remove leftover development artifacts from the product module** — **Priority:** Low
  - [ ] delete the two `CHANGED: img -> picture` comments in the card templates of `js/features/products.js`, which are emitted into the DOM of every rendered product card
  - [ ] remove the exported but unimported `initShopProducts`, whose work `initFilters` already performs for `[data-products="shop"]`, so no duplicate shop-rendering path remains
  - [ ] run `npm run qa:js` after the change
  - **Completion condition:** production markup carries no editing notes, and only one shop-rendering path exists.
  - **Source:** `daily-AUDIT.md` — P2-11

## Optional future improvements

- [ ] **O-01 — Extend validation to runtime-generated item URLs**
  - **Depends on:** `PH1-02`
  - **Value:** `scripts/validate-jsonld.js` asserts schema types and a source regex only, so it could not detect the `ItemList` URL defect; a check over runtime-generated URLs would keep catching it as pages are added.
  - **Scope boundary:** an addition to the existing validators using tooling already present in the repository; non-blocking, and not a change to the QA workflow shape.

- [ ] **O-02 — Harden cart state deserialization against malformed stored values**
  - **Value:** `getCart` in `js/features/cart.js` recovers from `JSON.parse` failures but returns whatever parsed successfully; a non-array value would then throw in `cart.find` and `cart.reduce` on every page that renders the cart badge.
  - **Scope boundary:** resilience for an edge case the project does not currently produce itself; not a defect in the present implementation.

- [ ] **O-03 — Add a no-JavaScript dark-theme fallback in CSS**
  - **Value:** `css/partials/themes.css` defines palettes only under `:root` and the `data-theme` attributes, while every document declares `<meta name="color-scheme" content="light dark">`; a `prefers-color-scheme` block would align the two for visitors without JavaScript.
  - **Scope boundary:** a refinement to the intentional JS-first theming model, not a correction to it.

- [ ] **O-04 — Reduce the shipped raster payload for product fallbacks**
  - **Value:** `public/assets/images/products/` holds roughly 19 MB of source rasters serving as the `<img>` fallbacks, while the AVIF and WebP variants modern browsers select are far smaller. No runtime measurement has been taken, so this is stated as payload size only.
  - **Scope boundary:** the retained source files are a deliberate part of the `tools/image-optimizer/` pipeline; variant generation itself is unaffected.

- [ ] **O-05 — Replace the inline-script allowance in the CSP with per-script hashes**
  - **Value:** `public/_headers` allows inline scripts; the only inline scripts are the build-time-stable theme preload block and the static JSON-LD in `index.html`, so hashing them would remove the broadest allowance in an otherwise tight policy.
  - **Scope boundary:** the current allowance is a deliberate trade-off for a static host, and all rendered content originates in the local catalog; non-blocking.

## Verification limits for this review

- The worktree was inspected statically and only `PLAN.md` was created; no application source, configuration, documentation, or generated output was changed.
- `node_modules/` is absent in this worktree, so no project QA, build, formatter, Lighthouse, browser, assistive-technology, or deployment check was run while producing this plan. Every item derives from source inspection plus findings in `daily-AUDIT.md` re-verified against the current files.
- `dist/` does not exist, so the production package, Service Worker runtime behavior, Netlify headers and redirects, and Netlify Forms delivery are assessed from their source contracts only.
