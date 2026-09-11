# Changelog

All significant changes to this project are documented in this file.

## [Unreleased]

### Added

- Added the initial verified multi-page storefront with a local JSON catalog, dynamic product views, category and price filters, sorting, and search suggestions.
- Added a browser-local cart with quantity and total calculations, a simulated checkout flow, client-side form validation, and a contact form configured for Netlify Forms.
- Added installable PWA metadata, Service Worker registration, installation and update prompts, runtime caching, and an offline fallback for previously controlled visits.
- Added accessibility foundations including skip navigation, visible keyboard focus, modal focus trapping and restoration, reduced-motion handling, live status regions, and field-level validation associations.
- Added canonical and social metadata, sitemap and robots directives, and static or runtime JSON-LD for the store, catalog, breadcrumb, and product views.

### Changed

- Aligned caching with Vite output: immutable headers apply only to hashed build assets, stable public URLs revalidate, and the custom Service Worker uses a content-derived deployment identity with cleanup limited to VoltGarage-owned caches.
- Moved the existing Volt Garage codebase from the shared portfolio into a dedicated project repository.
- Corrected the `interior-mat` product image reference to the existing PNG asset.
- Corrected runtime structured-data URL resolution so relative product links preserve the current page directory.
- Unified contact and checkout phone validation through a shared phone-field definition with corrected whitespace handling.
- Replaced the non-functional homepage newsletter form with a single real navigation outcome to the new-arrivals catalog.
- Guarded the simulated checkout success path against an empty cart and aligned the confirmation message with the project’s demonstration-only checkout scope.
- Aligned the Service Worker update flow with explicit user-controlled activation, preventing automatic first-install reloads and unintended cross-tab refreshes
- Made the 404 and offline fallback documents recoverable from nested URLs with root-absolute navigation and retry of the original failed request.
- Removed misleading shared navigation entries for delivery and returns so link labels match the content of their destinations.
- Repaired heading hierarchy across the shared footer, homepage hero card, and cart summary so rendered documents no longer skip heading levels.
- Gave the shared theme toggle a persistent accessible name, removed redundant live-region behavior, and kept `aria-pressed` as the source of theme state.
- Made add-to-cart confirmation feedback reliably restore each button’s original label after repeated rapid activation.
- Promoted Detailing to a first-class catalog category and aligned its product, shop filter, collection destination, and homepage presentation.
- Removed the duplicated homepage hero statistic and balanced the remaining three-item stats layout.
- Removed unreferenced and duplicated published assets, including obsolete hero sets, stray shortcut copies, orphan images, and mistyped product variants.
- Removed stale `humans.txt` references from repository and deployment documentation to match the current public package.
- Removed development-only product-card markup comments and the unused duplicate shop initializer.
- Added a CSS-only dark-theme fallback for visitors without JavaScript while preserving explicit theme preferences.
- Losslessly optimized product PNG fallbacks, reducing the production package by approximately 1.35 MiB while preserving decoded image pixels and existing asset paths.
- Aligned the privacy policy with the real Netlify contact-form contract, including the required surname and telephone fields, while clearly separating contact submissions from the demonstration-only checkout.
- Connected the real Netlify contact form to the existing branded thank-you page while preserving the native POST flow, non-indexed success route, and demonstration-only checkout boundary.
- Consolidated product image rendering around the catalog `image` path, removing redundant `imageBase` metadata while preserving all existing raster, AVIF, and WebP URLs.
- Separated full-resolution product masters from published raster fallbacks and resized the deployed fallbacks to measured runtime needs, reducing the production package by approximately 8.34 MiB while preserving existing product image URLs and AVIF/WebP assets.
- Replaced unsupported homepage hero statistics with catalog-backed product, category, and new-arrival counts, and removed unused fabricated `rating` data from all product records.
- Refined the PWA install prompt into a compact two-state interface that automatically collapses after 30 seconds while remaining available through a small `VOLT APP` chip, with explicit dismissal limited to the current browser session.

### Security

- Added static-hosting headers for Content Security Policy, frame denial, MIME sniffing prevention, referrer and permissions policies, and explicit HTML and asset caching rules.
- Replaced the broad inline-script CSP allowance with an exact SHA-256 hash for the early theme preload while preserving same-origin scripts and structured data.
- Removed the remaining inline-style CSP allowance by moving the header shadow into the existing class-based state and enforcing `style-src 'self'`.

### Documentation

- Reworked the Polish-first and English-second project README to document the verified architecture, workflows, source ownership, and deployment contract while clarifying the demonstrational checkout and absence of real orders or payments.
- Added the KP_CODE Proprietary Project License and aligned the root package license metadata with the project license file.
- Updated the PWA documentation in README and project settings to describe the waiting-worker update contract and user-triggered activation flow.
- Synchronized QA documentation with `package.json`, including the `qa:product-assets` command and product-image asset validation coverage in both Polish and English README sections.
- Added third-party notices and local SIL Open Font License 1.1 texts for the bundled Manrope and Space Grotesk font families, with aligned Polish and English README references.
- Updated the README to document the timed PWA install-prompt collapse, session-scoped dismissal, collapsed install chip, and current storage contract.

### Build and Tooling

- Replaced the custom build and preview pipeline with Vite 8.2.2 for the Vanilla MPA, preserving all 15 HTML routes and shared templates across development and production; updated the Node requirement to `^20.19.0 || >=22.12.0`.
- Added content-hashed production CSS/JS in `dist/build/` and consolidated static resources under `public/` with stable public URLs; removed tracked `.min` artifacts, legacy build/preview scripts, and obsolete direct build dependencies.
- Added a production pipeline that bundles and minifies CSS and JavaScript, expands shared HTML partials, rewrites production asset references, packages `dist/`, and rejects unresolved template or source-asset references.
- Limited Service Worker font precaching to bundled WOFF2 assets so accompanying font license files are distributed without changing the existing runtime precache contract.
- Raised the JavaScript linting baseline to `eslint:recommended`, expanding static analysis coverage while preserving the existing ESLint 8 configuration and adding one narrowly scoped exception for the intentional CSP control-character regex.
- Added a GitHub Actions quality workflow that runs locked dependency installation, the canonical QA suite, and the production build on pushes to `main`, pull requests targeting `main`, and manual dispatch, while keeping deployment outside CI.

### Fixed

- Hardened cart-state deserialization so malformed non-array localStorage values are treated as an empty cart instead of reaching array-only runtime operations.
- Prevented the closed mobile navigation from remaining keyboard-focusable and exposed to the accessibility tree while preserving the existing open-state and desktop navigation behavior.
- Made the demonstration checkout fail closed before JavaScript initialization so customer data cannot fall back to native URL or network submission.
- Corrected the shop filter panel semantics so it uses its own accessible heading instead of borrowing the product-results heading or unrelated shipping notice.
- Hardened cart deserialization against malformed array entries and isolated application initializers so one module failure no longer prevents later modules from starting.
- Debounced shop price-slider filtering and made reveal initialization lifecycle-safe so repeated product renders no longer accumulate IntersectionObserver instances.
- Aligned custom form validation with declared HTML patterns so checkout postal codes are validated consistently while preserving the established trimmed-value phone-validation contract.
- Prevented unknown product identifiers from silently rendering the first catalog item, preserving the existing default product route while keeping unrelated canonical metadata and Product structured data out of the not-found state.
- Aligned the cart and primary product-detail regions with the existing progressive-enhancement fallback contract, preventing unverified cart totals and checkout actions from appearing before successful JavaScript initialization.
- Repaired self-hosted font delivery by replacing incomplete subset assets with verified upstream Manrope static weights and the Space Grotesk variable font, restoring complete Latin and Polish glyph coverage without browser fallback.
- Corrected hidden toast rendering and collapsed install-prompt pointer handling so inactive UI no longer remains visually present or blocks underlying page interactions.

### Testing

- Added build-contract tests and production-package validation, and switched Lighthouse smoke checks to fresh Vite output served by Vite preview using the installed Lighthouse dependency.
- Added configured validation for HTML, JSON-LD, internal links, JavaScript, CSS, and formatting, plus report-only and threshold-enforced Lighthouse smoke workflows.
- Added catalog product-image asset validation for raster and optimized variants, wired into `npm run qa`.
- Added regression coverage for structured-data product, asset, breadcrumb, root-relative, and absolute URL resolution.
- Added regression coverage for published phone formats, native pattern validation, and JavaScript phone validation consistency.
- Added regression coverage for the homepage newsletter contract, preventing email collection and meaningless default form submission.
- Added regression coverage for empty-cart checkout refusal, current cart-state checks, preserved form data, and simulated checkout success behavior.
- Added regression coverage for first-install control, waiting updates, user-approved activation, and single-reload Service Worker behavior.
- Added regression coverage for fallback link resolution, nested 404 recovery, and offline retry behavior.
- Added regression coverage for shared navigation labels and destinations, including preserved access to checkout through the cart flow.
- Added regression coverage for heading-outline integrity across all 15 rendered documents and verified the corrected hierarchy through the production build.
- Added regression coverage for stable theme-toggle naming, pressed-state transitions, persistence, and system-theme behavior across the rendered site.
- Added deterministic regression coverage for repeated add-to-cart activation, per-button timer isolation, cart updates, and accessible-name restoration.
- Added regression coverage for category consistency across the catalog, shop filter, collection links, homepage pills, and filtered shop results.
- Added regression coverage for unique homepage hero statistics and verified the three-item layout across responsive viewports and both themes.
- Added published-asset inventory regression coverage and verified the reduced public package through production build and package validation.
- Updated the build-contract fixture to match the current public-file inventory and verified all package-contract tests remain green.
- Verified the simplified product rendering path with JavaScript QA and existing build-contract regression tests.
- Extended structured-data regression coverage to verify final runtime `ItemList` product URLs generated by shop and listing initializers.
- Added cart storage regression coverage for malformed persisted values, badge recovery, and add-to-cart normalization.
- Added regression coverage for no-JavaScript theme fallback precedence and dark-palette token parity.
- Verified pixel-level equivalence, product asset integrity, and byte-identical production copying for the optimized raster fallbacks.
- Added production CSP contract coverage for inline-script hash drift, unsafe directives, inline execution sinks, and browser-level theme and structured-data behavior.
- Verified mobile navigation focus isolation and state restoration across closed, open, and desktop layouts in Chromium, with existing navigation tests and the full QA suite remaining green.
- Added regression coverage for the fail-closed checkout contract and verified no-submission behavior with JavaScript unavailable, initialization interrupted, and the normal simulated flow active.
- Added regression coverage for the contact privacy contract, required data categories, contextual privacy-policy access, and separation between real contact submission and simulated checkout behavior.
- Added regression coverage for the shop filter landmark, native search-suggestion semantics, preserved results live-region behavior, and filter-control labeling.
- Added regression coverage for malformed and mixed cart records plus synchronous and asynchronous bootstrap failure isolation, with the full QA suite remaining green.
- Added regression coverage for settled price-slider rendering, immediate price-output updates, observer replacement and cleanup paths, reduced-motion behavior, and repeated product-grid rendering.
- Added regression coverage for generic pattern validation, valid and invalid postal-code formats, preserved phone whitespace semantics, unchanged phone-format acceptance, and checkout validation behavior.
- Added regression coverage for the contact success destination, preserved Netlify POST contract, thank-you route ownership, sitemap exclusion, noindex metadata, checkout separation, and success-page content integrity.
- Added regression coverage for missing, empty, valid, and unknown product identifiers, including preserved default-route behavior, product-specific metadata, not-found rendering, and structured-data isolation.
- Added regression coverage for static dynamic-region fallbacks, fail-closed cart-summary visibility, verified empty and populated cart totals, product-load failure handling, and preserved product-detail and checkout behavior.
- Extended product-asset validation to derive and verify optimized variants for all 12 catalog products, covering 12 raster images and all 24 AVIF/WebP variants including products previously skipped by the optional `imageBase` contract.
- Added source-versus-published product image regression coverage and verified 12 raster fallbacks, all 24 optimized variants, master exclusion from the production package, optimizer regeneration, and responsive raster rendering.
- Strengthened homepage statistics regression coverage so displayed figures are derived from the canonical product catalog and QA rejects count drift or reintroduction of unsupported rating data.
- Extended CSP regression coverage to reject inline style attributes, embedded style blocks, unsafe style directives, and known runtime inline-style sinks.
- Added regression coverage for the bundled font contract, including expected font artifacts, weight mappings, preload references, retired font paths, and artifact integrity.
- Added regression coverage for PWA install-prompt expansion, timed collapse, chip reopening, session dismissal, native installation, timer cleanup, focus-safe collapse, and separation from Service Worker update notifications.


