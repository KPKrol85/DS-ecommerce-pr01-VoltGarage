# Volt Garage — Development Plan

**Last reviewed:** 2026-09-01

**Project type:** Static multi-page front-end showcase using HTML, CSS, Vanilla JavaScript, and a Node-based production build

**Plan status:** Active

## Planning principles

- This plan reflects the current verified repository state and the findings in `daily-AUDIT.md`.
- Main items are checked only after all required subtasks and completion conditions are satisfied.
- Canonical HTML, partials, CSS, JavaScript, catalog data, and build scripts are changed at source; `css/main.min.css`, `js/main.min.js`, and `dist/` are regenerated and never edited manually.
- Historical completed changes remain in `CHANGELOG.md`; no completed plan items are reconstructed because this repository had no earlier `PLAN.md`.
- Browser, deployment, Service Worker, and external form behavior is claimed only after the relevant verification is run.

## Current priorities

1. `PH1-01` — Make deployment asset invalidation deterministic.
2. `PH1-02` — Repair the catalog image contract.
3. `PH2-01` — Align public legal copy with the real contact flow.
4. `PH3-01` — Synchronize navigation visibility, focus, and ARIA state.
5. `PH2-02` — Resolve the newsletter outcome after the required product decision.

## Phase 1 — Production delivery and catalog integrity

**Goal:** Ensure deployed application assets and product references always resolve to the intended current content.

- [ ] **PH1-01 — Implement deterministic deployment asset invalidation**
  - [ ] update `scripts/build-dist.js` to derive content-hashed deployment filenames from the generated CSS and JavaScript bundles and rewrite assembled HTML from the emitted mapping
  - [ ] keep long-lived `immutable` caching in `_headers` only for content-addressed URLs; give every stable mutable URL a revalidation-compatible policy
  - [ ] align `sw.js` cache handling and owned-cache cleanup with the emitted asset identities so release correctness does not depend on a manual cache-version change
  - [ ] make packaging fail when an emitted asset is missing, generated HTML retains a stable bundle URL, or source asset references remain in `dist/`
  - [ ] update `README.md` and `settings.md` where their build, cache, or generated-output descriptions change
  - [ ] verify that identical bundle content keeps the same deployed URL, changed content produces a new URL, all generated references resolve, and a previously controlled browser receives the new application layer without clearing storage
  - **Completion condition:** CSS or JavaScript content changes cannot be hidden behind an older immutable URL or an older Service Worker cache entry, while the documented offline behavior remains intact.
  - **Source:** `daily-AUDIT.md` — P1-01

- [ ] **PH1-02 — Repair and validate the product image contract**
  - [ ] change the `interior-mat` fallback in `data/products.json` from the missing `wnetrze-02.jpg` path to the existing canonical PNG asset
  - [ ] create a dependency-free catalog asset validator under `scripts/` that verifies every declared fallback and every AVIF/WebP variant derived from `imageBase`
  - [ ] add the validator to the relevant `package.json` QA workflow without weakening the existing checks
  - [ ] verify the corrected image in product cards, product details, `ItemList` data, and `Product` JSON-LD against a fresh production package
  - **Completion condition:** every product image URL derived from the canonical catalog exists in source and generated output, and a missing variant fails QA.
  - **Source:** `daily-AUDIT.md` — P1-02

## Phase 2 — Public form and disclosure contracts

**Goal:** Make every public form and related statement accurately represent whether data is transmitted or only simulated.

- [ ] **PH2-01 — Align legal copy with the implemented contact and checkout flows**
  - [ ] revise the contact-form statements in `pages/terms.html` so they no longer describe the native Netlify Forms submission as a simulated send
  - [ ] review the related form wording in `pages/privacy-policy.html` and the contact/checkout interfaces, correcting only contradictions supported by the current implementation
  - [ ] keep checkout, payments, order persistence, and fulfillment explicitly demonstrational; do not invent delivery, retention, operator, or processing claims
  - [ ] validate the affected source and generated HTML and search both layers for conflicting contact-versus-checkout statements
  - **Completion condition:** public legal and interface copy consistently distinguishes the transmitted contact request from the locally simulated checkout.
  - **Source:** `daily-AUDIT.md` — P1-03

- [ ] **PH2-02 — Define and implement an honest newsletter outcome** — **Status:** Blocked
  - [ ] confirm whether the project will collect subscriptions or replace the form-like control with clearly non-collecting promotional content
  - [ ] if collection is approved, record the submission destination and data-handling requirements before adding named form fields, accessible validation/status feedback, and consistent privacy wording
  - [ ] if collection is not approved, remove the email-entry and submit affordance so the interface does not imply that an address will be registered
  - [ ] verify the selected outcome in source and generated HTML, including keyboard behavior and the no-JavaScript path; verify one controlled deployed submission only when a real provider is approved
  - **Blocker:** no approved subscription destination, consent/data-handling contract, or decision to keep the section non-collecting is present in the repository.
  - **Unblocks when:** the intended product outcome and, if applicable, its submission and privacy contract are explicitly confirmed.
  - **Completion condition:** the rendered section truthfully represents one verified outcome and never falls through to a meaningless default form navigation.
  - **Source:** `daily-AUDIT.md` — P1-04

## Phase 3 — Navigation accessibility and progressive enhancement

**Goal:** Establish one coherent navigation state contract across viewport sizes, input methods, and JavaScript availability.

- [ ] **PH3-01 — Synchronize navigation visibility, focus, and ARIA state**
  - [ ] provide a usable mobile navigation baseline without JavaScript and expose the menu toggle only when its scripted behavior is available
  - [ ] remove closed mobile navigation and dropdown descendants from keyboard navigation instead of hiding them only with opacity and pointer-event rules
  - [ ] make the toggle, link activation, `Escape`, outside interaction, and viewport changes use one close path that synchronizes visible state and `aria-expanded`
  - [ ] prevent `:focus-within` from visually reopening a dropdown after JavaScript marks it closed, and return focus to the appropriate controlling element when focused content is closed
  - [ ] preserve supported desktop hover and keyboard behavior, then verify mobile and desktop tab order, arrow keys, `Escape`, focus return, resize transitions, and the no-JavaScript baseline in a browser
  - **Completion condition:** visible navigation state always agrees with its ARIA state, closed content is not focusable, and primary navigation remains usable without JavaScript.
  - **Source:** `daily-AUDIT.md` — P1-05; current `src/partials/header.html`, `css/partials/layout.css`, and `js/ui/header.js`

## Phase 4 — Repository and deployment hygiene

**Goal:** Remove non-portable maintenance guidance and keep draft assets outside the production package.

- [ ] **PH4-01 — Replace machine-specific project settings links**
  - [ ] replace the historical absolute checkout paths in `settings.md` with repository-relative references
  - [ ] verify that each resulting Markdown target exists from an arbitrary checkout location
  - [ ] search tracked documentation and configuration for remaining references to the removed checkout path
  - **Completion condition:** project settings contain no user-specific repository paths and all source/output references are portable.
  - **Source:** `daily-AUDIT.md` — P2-01

- [ ] **PH4-02 — Remove shortcut drafts from the deployment asset tree**
  - [ ] confirm that the manifest and source documents use only the three canonical files directly under `assets/icons/shortcuts/`
  - [ ] remove the unreferenced placeholder-named shortcut directories from the recursively copied production asset tree, preserving them outside `assets/` only if an explicit source need is confirmed
  - [ ] create a fresh production package and verify that required manifest shortcuts resolve while draft paths are absent from `dist/`
  - **Completion condition:** only intentional shortcut assets are published and no runtime reference depends on an excluded draft path.
  - **Source:** `daily-AUDIT.md` — P2-02

## Optional future improvements

- [ ] **O-01 — Add focused browser regression coverage for corrected interactions**
  - [ ] cover the navigation open/close, keyboard, focus-return, and responsive-transition contract established by `PH3-01`
  - [ ] cover the distinct contact, checkout, and selected newsletter outcomes after `PH2-01` and `PH2-02` are complete
  - **Depends on:** `PH2-01`, `PH2-02`, `PH3-01`
  - **Value:** protects the user-facing runtime contracts that static HTML, CSS, JavaScript, link, and JSON-LD checks do not exercise.
  - **Scope boundary:** non-blocking hardening only; do not introduce a framework migration or broad end-to-end suite.
  - **Source:** `daily-AUDIT.md` — Extra quality improvements

## Verification limits for this review

- The current worktree and canonical sources were inspected statically; no application source or generated output was changed.
- The historical audit records a passing focused HTML validation, but no project QA, build, formatter, Lighthouse, browser, assistive-technology, deployment, or external-form check was rerun while creating this plan.
- `dist/` was absent and was not regenerated, so runtime, Service Worker update, Netlify delivery, CDN headers, and public deployment behavior remain unverified beyond their source contracts.
