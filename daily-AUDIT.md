# Daily Front-End Audit — Volt Garage

**Audit date:** 2026-09-01

**Project type:** Static multi-page front-end showcase using HTML, CSS, Vanilla JavaScript, and a Node-based production build

**Audit mode:** Static repository review

## Overall assessment

Volt Garage has a clear canonical-source model, defensive browser-storage access, useful static validation, and a deliberate distinction between source files and generated deployment output. No current P0 blocker was detected. The core architecture is suitable for continued development, but five important issues should be addressed next: deployment cache invalidation, one broken product-image reference, a public legal/data-flow contradiction, a non-functional newsletter control, and keyboard/state inconsistencies in the shared navigation.

## Verified strengths

- Canonical HTML, shared partials, CSS layers, JavaScript modules, product data, and generated output ownership are explicitly separated; `scripts/build-dist.js` also rejects unresolved template tokens and source asset references in `dist/`.
- `data/products.json` is the single runtime catalog source, while product lists expose loading, empty, and error states and derive view-specific structured data from the loaded catalog.
- `js/services/storage.js` contains storage availability checks and guarded reads and writes, so unavailable `localStorage` does not block module initialization.
- Reveal content is visible by default, enhancement-only hiding is activated by JavaScript, and reduced-motion preferences remove the transition behavior.
- The configured source HTML inventory passed the repository's focused `html-validate` command during this audit.

## P0 — Critical risks

None detected.

## P1 — Important issues worth fixing next

### [P1-01] Production assets have stable URLs but year-long immutable and cache-first delivery

- **Classification:** Contract mismatch
- **Evidence:** `_headers:11`, `scripts/build-dist.js:19`, `sw.js:1`, `sw.js:78`
- **Current behavior:** The build always publishes `css/main.min.css` and `js/main.min.js` under stable URLs. Netlify headers mark `/css/*` and `/js/*` immutable for one year, while the Service Worker serves styles and scripts cache-first from a manually versioned cache.
- **Impact:** A deployment that changes CSS or JavaScript without changing its URL and Service Worker cache version can leave returning users on an older application layer, even while they receive newer HTML or data.
- **Recommended direction:** Introduce deterministic cache invalidation for generated assets and align the Service Worker strategy with that versioned asset contract.

### [P1-02] One catalog item references a missing fallback image

- **Classification:** Defect
- **Evidence:** `data/products.json:94`, `js/features/products.js:44`, `js/features/products.js:318`
- **Current behavior:** `interior-mat` declares `assets/images/products/wnetrze-02.jpg`, but the repository contains `wnetrze-02.png`; the derived AVIF and WebP files exist. The missing JPG URL is used as the `<img>` fallback and as the product structured-data image.
- **Impact:** Clients that use the fallback resource receive a broken product image, and the generated `Product` JSON-LD points search consumers to a non-existent image URL.
- **Recommended direction:** Align the catalog's canonical image path with the existing source asset and add referential validation for raw and optimized product images.

### [P1-03] Legal copy describes the contact submission as simulated although it is configured for Netlify Forms

- **Classification:** Contract mismatch
- **Evidence:** `pages/terms.html:269`, `pages/contact.html:173`, `README.md:163`
- **Current behavior:** The terms describe the contact form as a demonstration or simulation using test data, while the form performs a native `POST` and is marked for Netlify Forms; the project documentation identifies this as the real contact-delivery path.
- **Impact:** A user can submit personal data under a materially misleading description of whether the submission is actually transmitted and processed.
- **Recommended direction:** Separate the simulated checkout from the real contact flow in public legal copy and describe the deployed contact processing accurately.

### [P1-04] The newsletter form presents a subscription action without any delivery path

- **Classification:** Defect
- **Evidence:** `index.html:275`, `js/main.js:26`, `js/main.js:195`
- **Current behavior:** The newsletter form has no action, method, form-provider attributes, or JavaScript handler, and its email input has no `name`. Application form handling is explicitly limited to contact and checkout forms.
- **Impact:** Selecting “Dołączam” only performs the browser's default form navigation and cannot register the entered address, although the public control implies a working subscription.
- **Recommended direction:** Either connect the form to a declared submission flow or render it as clearly non-interactive demonstrational content.

### [P1-05] Shared navigation visibility is not synchronized with keyboard focus and ARIA state

- **Classification:** Defect
- **Evidence:** `css/partials/layout.css:167`, `css/partials/layout.css:255`, `js/ui/header.js:75`, `js/ui/header.js:155`
- **Current behavior:** The closed mobile navigation is hidden only with opacity and pointer-event rules, so its links remain keyboard-focusable. Dropdown closing removes `is-open` and sets `aria-expanded="false"`, but returning focus to the toggle still matches `:focus-within`, which keeps the dropdown visually open.
- **Impact:** Keyboard users can reach invisible navigation controls, and an Escape action can leave a visible menu whose exposed ARIA state says it is closed.
- **Recommended direction:** Use one visibility contract that also removes closed content from focus navigation, and ensure dropdown CSS cannot override the state represented by `aria-expanded`.

## P2 — Minor refinements

### [P2-01] Project settings link to a non-existent historical checkout

- **Classification:** Contract mismatch
- **Evidence:** `settings.md:9`
- **Current behavior:** The documented HTML, CSS, JavaScript, and `dist` links use absolute paths under `C:/Users/KPKro/MY FILES/codex-playground/pr-01-voltgarage/`; none of those targets exists in the current environment.
- **Impact:** Maintainers following the project settings are directed away from the active repository and receive broken file links.
- **Recommended direction:** Replace machine-specific historical links with repository-relative references.

### [P2-02] Unreferenced shortcut drafts are copied into every deployment package

- **Classification:** Maintenance risk
- **Evidence:** `assets/icons/shortcuts/dwadawedwea/`, `assets/icons/shortcuts/Projekt bez nazwy/`, `site.webmanifest:23`, `scripts/build-dist.js:18`
- **Current behavior:** Six alternative shortcut icons live under placeholder-named directories, while the manifest references only the three files directly under `assets/icons/shortcuts/`. The build recursively copies the complete `assets/` directory, including the 57,150 bytes of unused variants.
- **Impact:** The production package contains unexplained drafts and asset ownership is ambiguous, creating low-impact bloat and future selection mistakes.
- **Recommended direction:** Retain only the intentional shortcut sources or move non-production drafts outside the recursively copied asset tree.

## Extra quality improvements

### Add focused interaction and asset-contract smoke coverage

- **Evidence:** Current QA validates HTML, links, JSON-LD source patterns, JavaScript, and CSS, but it does not exercise the navigation state machine, public form outcomes, or confirm every catalog image variant exists.
- **Potential value:** A small automated check could catch the current fallback-image mismatch and regressions in shared navigation or form behavior before deployment.
- **Scope boundary:** This is an optional safeguard after the current defects are corrected; it does not require a framework migration or a broad end-to-end suite.

## Verification performed

- Inspected the current Git state; the worktree was clean before creating this audit.
- Inspected project documentation, package scripts and tool configuration, all page and shared-partial HTML, canonical CSS layers, JavaScript modules, product data, the image pipeline, Service Worker, manifest, Netlify headers and redirects, sitemap, build/preview scripts, and validation scripts.
- Executed `npm run qa:html`; it completed successfully for the configured 15-source-page inventory.
- Performed read-only path checks for catalog source and optimized images, the absolute links in `settings.md`, and manifest shortcut assets; no files were generated.
- Did not run the production build because it would write generated assets and recreate `dist/`. The full QA suite, formatter, Lighthouse, browser automation, assistive-technology testing, dependency audit, deployment, and external service verification were not run.
- `dist/` was absent and was not regenerated. Runtime, responsive, Service Worker update, Netlify form-delivery, and public deployment behavior therefore remain unverified beyond the cited source contracts.

## Senior rating

**Rating:** 6/10

The source organization, defensive initialization patterns, progressive reveal baseline, and static validation foundation are solid for a portfolio-scale Vanilla JavaScript MPA. The absence of a P0 blocker supports normal continued development, but the cache contract can preserve obsolete production code and several user-facing or public-content contracts are currently inconsistent, so the project is not yet at a high-confidence release-quality level.
