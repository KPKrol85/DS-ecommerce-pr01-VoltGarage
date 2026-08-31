# Volt Garage

## PL

### Przegląd projektu

Volt Garage to statyczny, wielostronicowy front-end sklepu z akcesoriami motoryzacyjnymi. Projekt działa na HTML, CSS i Vanilla JavaScript (ES Modules), renderuje katalog produktów z lokalnego pliku JSON i zawiera przepływ koszyk/checkout po stronie klienta.

Repozytorium zawiera także przygotowanie pod publikację statyczną: bundling assetów, generowanie katalogu `dist/`, konfigurację nagłówków i przekierowań oraz podstawowe elementy PWA (manifest, service worker, strona offline).

### Kluczowe funkcje

- Wielostronicowa struktura: strona główna, sklep, szczegóły produktu, nowości, promocje, kolekcje, kontakt, koszyk, checkout oraz strony prawne.
- Dynamiczne renderowanie list produktów i strony produktu na podstawie `data/products.json`.
- Filtrowanie katalogu po kategorii, cenie, sortowaniu oraz wyszukiwaniu z podpowiedziami.
- Koszyk zapisany w `localStorage` (dodawanie, usuwanie, zmiana ilości, podsumowanie kosztów).
- Formularze kontaktu/checkout z walidacją po stronie klienta i komunikatami błędów.
- Przełączanie motywu jasny/ciemny z preloadem ustawianym przed załadowaniem CSS.
- Dynamiczne JSON-LD dla breadcrumbs i list produktów oraz statyczne JSON-LD dla strony głównej.
- Rejestracja Service Workera z fallbackiem offline i komunikatami o aktualizacji.

### Stack technologiczny

**Runtime (front-end)**

- HTML5
- CSS (architektura oparta o partiale)
- Vanilla JavaScript (ES Modules)
- Dane produktów: JSON (`data/products.json`)

**Narzędzia i jakość**

- Node.js `>=18`
- PostCSS (`postcss-cli`, `postcss-import`, `cssnano`)
- esbuild
- Prettier
- ESLint
- Stylelint
- html-validate
- Lighthouse (skrypt smoke QA)
- sharp (optymalizacja obrazów)

### Struktura projektu

```text
.
├─ index.html
├─ 404.html
├─ offline.html
├─ thank-you.html
├─ pages/                 # Podstrony sklepu i stron prawnych
├─ src/partials/          # Partiale HTML (header/footer) składane w buildzie dist
├─ css/
│  ├─ main.css            # Główny entry CSS (import partiali)
│  ├─ main.min.css        # Wersja produkcyjna
│  └─ partials/
├─ js/
│  ├─ main.js             # Bootstrap aplikacji
│  ├─ main.min.js         # Bundle produkcyjny
│  ├─ features/           # Produkty, filtry, koszyk
│  ├─ ui/                 # Moduły UI (theme, header, modal, accessibility, PWA)
│  ├─ services/           # Dostęp do danych i storage
│  └─ core/               # Event bus i obsługa błędów
├─ data/products.json
├─ assets/                # Obrazy, fonty, favicony, ikony
├─ scripts/               # Build dist, preview, walidatory QA
├─ tools/image-optimizer/ # Narzędzia optymalizacji obrazów
├─ sw.js
├─ site.webmanifest
├─ _headers
├─ _redirects
├─ robots.txt
└─ sitemap.xml
```

### Instalacja i konfiguracja

```bash
npm install
```

Wymagane środowisko: Node.js w wersji zgodnej z `>=18`.

### Development lokalny

Repozytorium nie zawiera dedykowanego dev-servera z hot reload. Praca lokalna opiera się na edycji plików źródłowych oraz uruchamianiu walidacji i builda.

Najczęściej używane komendy:

```bash
npm run qa
npm run qa:html
npm run qa:js
npm run qa:css
npm run qa:links
npm run validate:jsonld
npm run format:check
```

### Build produkcyjny

```bash
npm run build
```

Build obejmuje:

- minifikację CSS do `css/main.min.css`,
- bundling i minifikację JS do `js/main.min.js`,
- generowanie katalogu `dist/` ze składaniem partiali HTML i podmianą referencji na assety `.min`.

Podgląd buildu `dist`:

```bash
npm run preview
```

### Deployment

Repozytorium zawiera pliki konfiguracyjne dla hostingu statycznego:

- `_headers` (nagłówki bezpieczeństwa i cache-control),
- `_redirects` (fallback 404),
- `robots.txt`,
- `sitemap.xml`.

### Dostępność

W kodzie zaimplementowano m.in.:

- skip link do głównej treści (`#main`),
- nawigację opartą o semantyczne elementy i przyciski z atrybutami ARIA,
- widoczne style `:focus-visible`,
- obsługę trybu klawiaturowego (`using-keyboard`),
- ograniczenie animacji dla `prefers-reduced-motion`,
- focus trap dla modalu projektu,
- walidację formularzy z `aria-invalid`, `aria-describedby` i komunikatami live.

### SEO

Wdrożone elementy SEO obejmują:

- `title`, `meta description`, canonical, Open Graph i Twitter cards na stronach,
- statyczne JSON-LD (`OnlineStore`, `WebSite`) na stronie głównej,
- dynamiczne JSON-LD (`BreadcrumbList`, `ItemList`, `Product`) zależnie od widoku,
- `robots.txt` i `sitemap.xml`,
- assety Open Graph w `assets/images/og`.

### Wydajność

Zaimplementowane mechanizmy związane z wydajnością:

- obrazy responsywne (`picture`, AVIF/WebP + fallback),
- `loading` i `decoding` dla obrazów,
- deklarowane wymiary grafik w kluczowych widokach,
- preload czcionki i hero image na stronie głównej,
- `font-display: swap` dla fontów,
- bundling i minifikacja CSS/JS,
- cache w Service Workerze (HTML oraz assety statyczne) z obsługą strony offline.

### Utrzymanie projektu

- Główny punkt wejścia logiki aplikacji: `js/main.js`.
- Moduły domenowe (produkty, filtry, koszyk): `js/features/`.
- Moduły UI (header, theme, PWA, accessibility, structured data): `js/ui/`.
- Skrypty build/QA: `scripts/`.
- Konfiguracja jakości kodu: `.eslintrc.cjs`, `.stylelintrc.cjs`, `.prettierrc.json`, `htmlvalidate.json`.
- Źródło danych produktowych: `data/products.json`.

### Roadmap

- Dodać automatyczne testy E2E dla kluczowych flow (sklep, koszyk, checkout).
- Rozdzielić dane produktowe i metadane SEO na spójne moduły źródłowe.
- Rozszerzyć walidację CI o obowiązkowe uruchomienie `qa` i `build` na każdym PR.
- Ujednolicić katalog ikon/shortcutów manifestu (usunąć duplikaty i katalogi robocze).

## EN

### Project Overview

Volt Garage is a static, multi-page front-end for an automotive accessories store. The project uses HTML, CSS, and Vanilla JavaScript (ES Modules), renders product catalog views from a local JSON file, and includes a client-side cart/checkout flow.

The repository also includes static deployment preparation: asset bundling, `dist/` generation, security/cache headers and redirects configuration, and baseline PWA elements (manifest, service worker, offline page).

### Key Features

- Multi-page structure: home, shop, product details, new arrivals, promotions, collections, contact, cart, checkout, and legal pages.
- Dynamic product list and product detail rendering from `data/products.json`.
- Catalog filtering by category, price, sorting, and search with suggestions.
- `localStorage`-based cart (add/remove/update quantity, totals summary).
- Contact/checkout forms with client-side validation and inline error messaging.
- Light/dark theme switching with pre-CSS theme preload.
- Dynamic JSON-LD injection for breadcrumbs and product lists, plus static homepage JSON-LD.
- Service Worker registration with offline fallback and update prompts.

### Tech Stack

**Runtime (front-end)**

- HTML5
- CSS (partials-based architecture)
- Vanilla JavaScript (ES Modules)
- Product data: JSON (`data/products.json`)

**Tooling and quality**

- Node.js `>=18`
- PostCSS (`postcss-cli`, `postcss-import`, `cssnano`)
- esbuild
- Prettier
- ESLint
- Stylelint
- html-validate
- Lighthouse (smoke QA script)
- sharp (image optimization)

### Project Structure

```text
.
├─ index.html
├─ 404.html
├─ offline.html
├─ thank-you.html
├─ pages/                 # Store and legal subpages
├─ src/partials/          # HTML partials (header/footer) assembled in dist build
├─ css/
│  ├─ main.css            # Main CSS entry (imports partials)
│  ├─ main.min.css        # Production output
│  └─ partials/
├─ js/
│  ├─ main.js             # App bootstrap
│  ├─ main.min.js         # Production bundle
│  ├─ features/           # Products, filters, cart
│  ├─ ui/                 # UI modules (theme, header, modal, accessibility, PWA)
│  ├─ services/           # Data and storage access
│  └─ core/               # Event bus and error handling
├─ data/products.json
├─ assets/                # Images, fonts, favicons, icons
├─ scripts/               # Dist build, preview, QA validators
├─ tools/image-optimizer/ # Image optimization tools
├─ sw.js
├─ site.webmanifest
├─ _headers
├─ _redirects
├─ robots.txt
└─ sitemap.xml
```

### Setup and Installation

```bash
npm install
```

Required environment: Node.js version compatible with `>=18`.

### Local Development

The repository does not provide a dedicated hot-reload dev server. Local work is based on editing source files and running QA/build scripts.

Most used commands:

```bash
npm run qa
npm run qa:html
npm run qa:js
npm run qa:css
npm run qa:links
npm run validate:jsonld
npm run format:check
```

### Production Build

```bash
npm run build
```

The build process includes:

- CSS minification to `css/main.min.css`,
- JS bundling and minification to `js/main.min.js`,
- `dist/` generation with HTML partial assembly and `.min` asset reference rewrites.

Preview `dist` build:

```bash
npm run preview
```

### Deployment

The repository includes static hosting configuration files:

- `_headers` (security and cache-control headers),
- `_redirects` (404 fallback),
- `robots.txt`,
- `sitemap.xml`.

### Accessibility

The codebase implements, among others:

- a skip link targeting the main content (`#main`),
- semantic navigation with button-based controls and ARIA attributes,
- visible `:focus-visible` states,
- keyboard-mode handling (`using-keyboard`),
- reduced motion behavior for `prefers-reduced-motion`,
- focus trap handling for the project modal,
- form validation with `aria-invalid`, `aria-describedby`, and live status feedback.

### SEO

Implemented SEO surface includes:

- `title`, `meta description`, canonical, Open Graph, and Twitter cards across pages,
- static homepage JSON-LD (`OnlineStore`, `WebSite`),
- dynamic JSON-LD (`BreadcrumbList`, `ItemList`, `Product`) per view,
- `robots.txt` and `sitemap.xml`,
- Open Graph assets in `assets/images/og`.

### Performance

Implemented performance-related mechanisms:

- responsive images (`picture`, AVIF/WebP + fallback),
- image `loading` and `decoding` attributes,
- explicit image dimensions in key views,
- homepage font and hero-image preload,
- `font-display: swap` for webfonts,
- CSS/JS bundling and minification,
- Service Worker caching (HTML and static assets) with offline fallback.

### Project Maintenance

- Main app logic entry point: `js/main.js`.
- Domain modules (products, filters, cart): `js/features/`.
- UI modules (header, theme, PWA, accessibility, structured data): `js/ui/`.
- Build/QA scripts: `scripts/`.
- Code quality configuration: `.eslintrc.cjs`, `.stylelintrc.cjs`, `.prettierrc.json`, `htmlvalidate.json`.
- Product data source: `data/products.json`.

### Roadmap

- Add E2E tests for key flows (shop, cart, checkout).
- Separate product data and SEO metadata into consistent source modules.
- Extend CI validation to require `qa` and `build` for every PR.
- Clean up manifest icon/shortcut directories (remove duplicates and working folders).
