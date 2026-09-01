# Volt Garage

## PL

### Przegląd projektu

Volt Garage to demonstracyjny, statyczny front-end wielostronicowego sklepu z akcesoriami motoryzacyjnymi, przygotowany jako projekt portfolio KP_Code Digital Studio. Warstwa źródłowa korzysta z HTML, CSS oraz modułów Vanilla JavaScript, a katalog produktów jest renderowany z lokalnego pliku `data/products.json`.

Projekt prezentuje interfejs katalogu, koszyka i checkoutu, ale nie jest aktywnym sklepem. Nie zawiera backendu sprzedażowego, kont użytkowników, płatności ani zapisu zamówień; wysłanie formularza checkoutu jest symulowane w przeglądarce. Formularz kontaktowy stanowi osobny przepływ skonfigurowany dla Netlify Forms.

### Wersja online

[Volt Garage — publiczna wersja demonstracyjna](https://e-commerce-pr01-voltgarage.netlify.app/)

### Kluczowe funkcje

- Wielostronicowa nawigacja obejmująca stronę główną, katalog, szczegóły produktu, nowości, promocje, kolekcje, kontakt, koszyk, checkout oraz strony prawne.
- Dynamiczne listy i szczegóły produktów z obsługą stanów ładowania, pustego wyniku i błędu.
- Filtrowanie katalogu według kategorii i ceny, sortowanie oraz wyszukiwanie z podpowiedziami.
- Koszyk w `localStorage`: dodawanie i usuwanie pozycji, zmiana ilości oraz obliczanie wartości produktów, dostawy i sumy.
- Walidacja formularzy po stronie klienta z komunikatami pól i przenoszeniem fokusu do pierwszego błędu; formularz kontaktowy zachowuje natywną wysyłkę do Netlify Forms.
- Jasny i ciemny motyw oparty na preferencji systemowej oraz ustawieniu zapisanym w `localStorage`.
- Manifest aplikacji, Service Worker, częściowa obsługa offline oraz komunikaty instalacji i aktualizacji zależne od możliwości przeglądarki.

### Stack technologiczny

**Front-end**

- semantyczny HTML5,
- CSS z custom properties i entry pointem składającym partiale,
- Vanilla JavaScript w modułach ES,
- przeglądarkowe API: Fetch, `localStorage`, Service Worker i Cache Storage,
- lokalne dane JSON.

**Build i kontrola jakości**

- Node.js `>=18` oraz npm,
- PostCSS, `postcss-import` i cssnano,
- esbuild,
- Prettier, ESLint, Stylelint i html-validate,
- własne walidatory linków wewnętrznych i JSON-LD,
- Lighthouse do testów smoke,
- sharp, fast-glob i minimist w narzędziu optymalizacji obrazów.

### Architektura

- Pliki HTML w katalogu głównym i `pages/` są kanonicznymi dokumentami stron. Zawierają dyrektywy `@include`, które podczas budowania rozwijają współdzielone partiale `src/partials/header.html` i `src/partials/footer.html`.
- `js/main.js` uruchamia moduły tylko dla elementów obecnych na bieżącej stronie. Funkcje katalogu i koszyka znajdują się w `js/features/`, dostęp do danych i pamięci w `js/services/`, a zachowania interfejsu w `js/ui/`.
- `data/products.json` jest kanonicznym źródłem katalogu. Dane są pobierane przez Fetch API i przechowywane w pamięci na czas bieżącej sesji strony.
- `css/main.css` importuje warstwy z `css/partials/`. PostCSS składa i minifikuje je do produkcyjnego arkusza.
- `scripts/build-dist.js` tworzy `dist/`, rozwija partiale HTML, kopiuje pliki statyczne i przełącza dokumenty na minifikowane assety.

### Struktura projektu

```text
.
├── index.html                 # Strona główna i źródłowy entry HTML
├── pages/                     # Widoki sklepu, checkoutu, kontaktu i stron prawnych
├── src/partials/              # Współdzielone partiale headera i footera
├── css/
│   ├── main.css               # Kanoniczny entry CSS
│   ├── main.min.css           # Wygenerowany asset produkcyjny
│   └── partials/              # Warstwy stylów
├── js/
│   ├── main.js                # Entry modułów aplikacji
│   ├── main.min.js            # Wygenerowany bundle produkcyjny
│   ├── core/                  # Zdarzenia i obsługa błędów
│   ├── features/              # Produkty, filtry i koszyk
│   ├── services/              # Dane produktów i bezpieczny dostęp do storage
│   └── ui/                    # Nawigacja, motyw, dostępność, PWA i JSON-LD
├── data/products.json         # Lokalne dane produktowe
├── assets/                    # Obrazy, fonty, ikony i warianty zoptymalizowane
├── scripts/                   # Build, preview i walidatory QA
├── tools/image-optimizer/     # Pipeline optymalizacji obrazów
├── sw.js                      # Kanoniczny Service Worker
├── site.webmanifest           # Manifest aplikacji
├── _headers                   # Nagłówki dla hostingu statycznego
├── _redirects                 # Reguła strony 404
├── robots.txt
├── sitemap.xml
├── package.json
└── LICENSE
```

### Instalacja

Wymagany jest Node.js w wersji zgodnej z `>=18`. Repozytorium używa npm i zawiera `package-lock.json`.

```bash
npm ci
```

### Build produkcyjny

```bash
npm run build
npm run preview
```

`npm run build` generuje `css/main.min.css` i `js/main.min.js`, a następnie odtwarza pakiet wdrożeniowy `dist/`. `npm run preview` udostępnia istniejący katalog `dist/` pod adresem `http://127.0.0.1:4173`; repozytorium nie zawiera osobnego serwera developerskiego z hot reload.

`css/main.min.css`, `js/main.min.js` i `dist/` są wynikami procesu budowania i nie powinny być edytowane ręcznie. Katalog `dist/` nie jest wersjonowany.

### Testy i walidacja

```bash
npm run qa
npm run format:check
npm run qa:smoke
npm run qa:smoke:enforce
```

- `npm run qa` sprawdza źródłowy HTML, JSON-LD, linki wewnętrzne, JavaScript i CSS.
- `npm run format:check` weryfikuje formatowanie bez zapisu zmian.
- `npm run qa:smoke` uruchamia raportowe audyty Lighthouse dla strony głównej, katalogu i strony produktu.
- `npm run qa:smoke:enforce` używa tego samego zakresu, ale zwraca błąd po niespełnieniu skonfigurowanych progów.

Są to skonfigurowane workflow jakości; repozytorium nie deklaruje pokrycia testami ani formalnej zgodności na podstawie samych skryptów.

### Wdrożenie

`dist/` jest kompletnym pakietem hostingu statycznego. Build kopiuje do niego m.in. `site.webmanifest`, `sw.js`, `robots.txt`, `sitemap.xml`, `_headers` i `_redirects`.

Publiczna wersja demonstracyjna jest hostowana w Netlify. `_headers` definiuje politykę CSP, podstawowe nagłówki ochronne i reguły cache, a `_redirects` kieruje nieznalezione ścieżki do `404.html`. Repozytorium nie zawiera polecenia wdrożeniowego ani workflow CI/CD.

### Dostępność

Implementacja zawiera konkretne mechanizmy dostępności, bez deklarowania formalnej zgodności WCAG:

- skip link do `#main`, semantyczne landmarki i natywne kontrolki,
- nawigację rozwijaną z synchronizacją `aria-expanded`, obsługą `Escape` i klawiszy strzałek,
- style `:focus-visible` i rozpoznawanie nawigacji klawiaturą,
- focus trap i przywracanie fokusu dla modalu informacyjnego,
- `prefers-reduced-motion` dla ograniczenia animacji,
- stany `aria-busy`, regiony `aria-live` oraz formularze z `aria-invalid` i `aria-describedby`.

### SEO

Dokumenty HTML zawierają tytuły, opisy, adresy canonical, metadane Open Graph i Twitter Cards. Strona główna udostępnia statyczne dane `OnlineStore` i `WebSite`, a JavaScript generuje `BreadcrumbList`, `ItemList` i `Product` zależnie od widoku. Repozytorium zawiera również `robots.txt`, `sitemap.xml` i obrazy social preview w `assets/images/og/`.

Te mechanizmy opisują warstwę metadanych; nie stanowią deklaracji wyników pozycjonowania.

### PWA i obsługa offline

`site.webmanifest` definiuje tryb `standalone`, ikony, skróty oraz zrzuty ekranu. `js/main.js` rejestruje `/sw.js`, a moduł `js/ui/pwa-prompts.js` obsługuje zdarzenia instalacji, zmianę stanu online/offline i komunikat o dostępnej aktualizacji.

Service Worker precache'uje `/` i `/offline.html`, stosuje strategię network-first dla nawigacji oraz cache dla odwiedzonych dokumentów, stylów, skryptów, obrazów i fontów. Obsługa offline jest częściowa: zależy od wcześniejszej instalacji Service Workera i zawartości zapisanej w cache, więc nie gwarantuje dostępności wszystkich tras przy pierwszej wizycie offline.

### Wydajność

- Build łączy i minifikuje CSS oraz JavaScript.
- Hero używa responsywnego `srcset` oraz formatów AVIF/WebP z fallbackiem JPG.
- Karty produktów używają AVIF/WebP z fallbackiem JPG/PNG, lazy loadingiem, asynchronicznym dekodowaniem i zadeklarowanymi wymiarami.
- Lokalne fonty WOFF2 korzystają z `font-display: swap`; strona główna preloaduje kluczowy font i obraz hero.
- `_headers` ustawia długie cache dla assetów oraz wymusza rewalidację HTML.

Repozytorium nie przechowuje w README aktualnych wyników Lighthouse ani Core Web Vitals.

### Dane i trwałość stanu

- Katalog produktów pochodzi wyłącznie z `data/products.json`; aplikacja nie pobiera go z zewnętrznego API.
- Koszyk (`volt_cart`), motyw (`vg_theme`), akceptacja modalu projektu i odrzucenie komunikatu instalacji są zapisywane lokalnie w przeglądarce.
- Formularz kontaktowy ma konfigurację Netlify Forms i po poprawnej walidacji korzysta z natywnego żądania `POST`.
- Formularz checkoutu wyświetla lokalny komunikat powodzenia i resetuje pola. Nie zapisuje ani nie wysyła zamówienia i nie obsługuje płatności.

Projekt nie implementuje bazy danych, uwierzytelniania, kont użytkowników ani synchronizacji między urządzeniami.

### Utrzymanie projektu

- Zmiany wspólnego headera lub footera należy wprowadzać w `src/partials/`, a wynik odtwarzać przez build.
- Zmiany katalogu produktów należy wprowadzać w `data/products.json`; widoki produktów i dane strukturalne są budowane z tego źródła w runtime.
- Po zmianie tras trzeba zsynchronizować dokumenty HTML, `package.json`, `sitemap.xml`, `site.webmanifest` oraz listy używane przez walidatory.
- Obrazy źródłowe znajdują się w `assets/images/`, a ich pipeline i tryby zapisu opisuje `tools/image-optimizer/README.md`.
- `dist/`, `css/main.min.css` i `js/main.min.js` są artefaktami generowanymi; kanonicznymi źródłami pozostają HTML, `src/partials/`, `css/main.css`, `css/partials/` i `js/main.js` wraz z importowanymi modułami.

### Licencja

Kod i materiały należące do właściciela projektu są udostępniane na warunkach **Własnościowej Licencji Projektu KP_CODE, wersja 1.0**. Projekt nie jest oprogramowaniem open source. Szczegółowe dozwolone użycie, ograniczenia i zasady dotyczące materiałów podmiotów trzecich znajdują się w pliku [LICENSE](LICENSE).

## EN

### Project Overview

Volt Garage is a demonstrational, static front-end for a multi-page automotive accessories store, created as a KP_Code Digital Studio portfolio project. Its source layer uses HTML, CSS, and Vanilla JavaScript modules, while the product catalog is rendered from the local `data/products.json` file.

The project presents catalog, cart, and checkout interfaces, but it is not an active store. It has no commerce backend, user accounts, payments, or order persistence; submitting the checkout form is simulated in the browser. The contact form is a separate flow configured for Netlify Forms.

### Live Version

[Volt Garage — public demo](https://e-commerce-pr01-voltgarage.netlify.app/)

### Key Features

- Multi-page navigation covering the homepage, catalog, product details, new arrivals, promotions, collections, contact, cart, checkout, and legal pages.
- Dynamic product lists and details with loading, empty, and error states.
- Catalog filtering by category and price, sorting, and search suggestions.
- `localStorage` cart with item addition and removal, quantity updates, and product, shipping, and total calculations.
- Client-side form validation with field feedback and focus transfer to the first error; the contact form preserves native submission to Netlify Forms.
- Light and dark themes based on the system preference and a setting persisted in `localStorage`.
- App manifest, Service Worker, partial offline behavior, and browser-capability-dependent installation and update prompts.

### Tech Stack

**Front-end**

- semantic HTML5,
- CSS with custom properties and a partial-composing entry point,
- Vanilla JavaScript with ES modules,
- browser APIs: Fetch, `localStorage`, Service Worker, and Cache Storage,
- local JSON data.

**Build and quality assurance**

- Node.js `>=18` and npm,
- PostCSS, `postcss-import`, and cssnano,
- esbuild,
- Prettier, ESLint, Stylelint, and html-validate,
- custom internal-link and JSON-LD validators,
- Lighthouse for smoke checks,
- sharp, fast-glob, and minimist in the image optimization tool.

### Architecture

- HTML files in the repository root and `pages/` are the canonical page documents. They contain `@include` directives expanded during the build from the shared `src/partials/header.html` and `src/partials/footer.html` partials.
- `js/main.js` initializes modules only for elements present on the current page. Catalog and cart features live in `js/features/`, data and storage access in `js/services/`, and interface behavior in `js/ui/`.
- `data/products.json` is the canonical catalog source. The data is loaded through the Fetch API and held in memory for the current page session.
- `css/main.css` imports layers from `css/partials/`. PostCSS assembles and minifies them into the production stylesheet.
- `scripts/build-dist.js` creates `dist/`, expands HTML partials, copies static files, and switches documents to the minified assets.

### Project Structure

```text
.
├── index.html                 # Homepage and source HTML entry
├── pages/                     # Store, checkout, contact, and legal views
├── src/partials/              # Shared header and footer partials
├── css/
│   ├── main.css               # Canonical CSS entry
│   ├── main.min.css           # Generated production asset
│   └── partials/              # Style layers
├── js/
│   ├── main.js                # Application module entry
│   ├── main.min.js            # Generated production bundle
│   ├── core/                  # Events and error handling
│   ├── features/              # Products, filters, and cart
│   ├── services/              # Product data and safe storage access
│   └── ui/                    # Navigation, theme, accessibility, PWA, and JSON-LD
├── data/products.json         # Local product data
├── assets/                    # Images, fonts, icons, and optimized variants
├── scripts/                   # Build, preview, and QA validators
├── tools/image-optimizer/     # Image optimization pipeline
├── sw.js                      # Canonical Service Worker
├── site.webmanifest           # Application manifest
├── _headers                   # Static-hosting headers
├── _redirects                 # 404 rule
├── robots.txt
├── sitemap.xml
├── package.json
└── LICENSE
```

### Installation

Node.js compatible with `>=18` is required. The repository uses npm and includes `package-lock.json`.

```bash
npm ci
```

### Production Build

```bash
npm run build
npm run preview
```

`npm run build` generates `css/main.min.css` and `js/main.min.js`, then recreates the deployable `dist/` package. `npm run preview` serves the existing `dist/` directory at `http://127.0.0.1:4173`; the repository does not provide a separate hot-reload development server.

`css/main.min.css`, `js/main.min.js`, and `dist/` are build outputs and should not be edited manually. The `dist/` directory is not versioned.

### Testing and Validation

```bash
npm run qa
npm run format:check
npm run qa:smoke
npm run qa:smoke:enforce
```

- `npm run qa` checks source HTML, JSON-LD, internal links, JavaScript, and CSS.
- `npm run format:check` verifies formatting without writing changes.
- `npm run qa:smoke` runs report-only Lighthouse audits for the homepage, catalog, and product page.
- `npm run qa:smoke:enforce` uses the same scope but returns a failure when configured thresholds are not met.

These are configured quality workflows; their presence alone does not establish test coverage or formal compliance.

### Deployment

`dist/` is the complete static-hosting package. The build copies files including `site.webmanifest`, `sw.js`, `robots.txt`, `sitemap.xml`, `_headers`, and `_redirects` into it.

The public demo is hosted on Netlify. `_headers` defines a CSP, baseline protective headers, and caching rules, while `_redirects` sends unresolved paths to `404.html`. The repository does not contain a deployment command or CI/CD workflow.

### Accessibility

The implementation includes concrete accessibility mechanisms without claiming formal WCAG compliance:

- a skip link to `#main`, semantic landmarks, and native controls,
- dropdown navigation with synchronized `aria-expanded`, `Escape`, and arrow-key handling,
- `:focus-visible` styles and keyboard-navigation detection,
- a focus trap and focus restoration for the informational modal,
- `prefers-reduced-motion` behavior,
- `aria-busy` states, `aria-live` regions, and forms using `aria-invalid` and `aria-describedby`.

### SEO

The HTML documents contain titles, descriptions, canonical URLs, Open Graph metadata, and Twitter Cards. The homepage exposes static `OnlineStore` and `WebSite` data, while JavaScript generates `BreadcrumbList`, `ItemList`, and `Product` data for the relevant views. The repository also includes `robots.txt`, `sitemap.xml`, and social preview images in `assets/images/og/`.

These mechanisms describe the metadata layer; they do not claim search-ranking results.

### PWA and Offline Support

`site.webmanifest` defines `standalone` display mode, icons, shortcuts, and screenshots. `js/main.js` registers `/sw.js`, while `js/ui/pwa-prompts.js` handles installation events, online/offline status changes, and update messaging.

The Service Worker precaches `/` and `/offline.html`, uses a network-first strategy for navigation, and caches visited documents, styles, scripts, images, and fonts. Offline support is partial: it depends on prior Service Worker installation and cached content, so it does not guarantee that every route is available on a first offline visit.

### Performance

- The build bundles and minifies CSS and JavaScript.
- The hero uses responsive `srcset` resources and AVIF/WebP formats with a JPG fallback.
- Product cards use AVIF/WebP with JPG/PNG fallbacks, lazy loading, asynchronous decoding, and declared dimensions.
- Local WOFF2 fonts use `font-display: swap`; the homepage preloads a key font and hero image.
- `_headers` configures long-lived caching for assets and revalidation for HTML.

The repository does not record current Lighthouse or Core Web Vitals results in this README.

### Data and State Persistence

- The product catalog comes exclusively from `data/products.json`; the application does not retrieve it from an external API.
- The cart (`volt_cart`), theme (`vg_theme`), project-modal acceptance, and install-prompt dismissal are persisted locally in the browser.
- The contact form is configured for Netlify Forms and uses a native `POST` request after successful validation.
- The checkout form displays a local success message and resets its fields. It does not persist or transmit an order and does not process payments.

The project does not implement a database, authentication, user accounts, or cross-device synchronization.

### Project Maintenance

- Shared header or footer changes belong in `src/partials/`, followed by build regeneration.
- Catalog changes belong in `data/products.json`; product views and structured data are built from this source at runtime.
- Route changes require synchronization across the HTML documents, `package.json`, `sitemap.xml`, `site.webmanifest`, and validator inventories.
- Source images live in `assets/images/`; `tools/image-optimizer/README.md` documents their pipeline and write modes.
- `dist/`, `css/main.min.css`, and `js/main.min.js` are generated artifacts; the canonical sources are the HTML documents, `src/partials/`, `css/main.css`, `css/partials/`, and `js/main.js` with its imported modules.

### License

Code and materials owned by the project owner are provided under the **KP_CODE Proprietary Project License, version 1.0**. The project is not open-source software. Detailed permitted uses, restrictions, and rules for third-party materials are defined in [LICENSE](LICENSE).
