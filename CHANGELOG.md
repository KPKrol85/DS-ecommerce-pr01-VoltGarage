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

- Moved the existing Volt Garage codebase from the shared portfolio into a dedicated project repository.

### Security

- Added static-hosting headers for Content Security Policy, frame denial, MIME sniffing prevention, referrer and permissions policies, and explicit HTML and asset caching rules.

### Documentation

- Reworked the Polish-first and English-second project README to document the verified architecture, workflows, source ownership, and deployment contract while clarifying the demonstrational checkout and absence of real orders or payments.
- Added the KP_CODE Proprietary Project License and aligned the root package license metadata with the project license file.

### Build and Tooling

- Added a production pipeline that bundles and minifies CSS and JavaScript, expands shared HTML partials, rewrites production asset references, packages `dist/`, and rejects unresolved template or source-asset references.

### Testing

- Added configured validation for HTML, JSON-LD, internal links, JavaScript, CSS, and formatting, plus report-only and threshold-enforced Lighthouse smoke workflows.
