# Volt Garage

## PL

### Przegląd projektu

Volt Garage to demonstracyjny, statyczny front-end wielostronicowego sklepu z akcesoriami motoryzacyjnymi, przygotowany jako projekt portfolio KP_Code Digital Studio. Warstwa źródłowa korzysta z HTML, CSS oraz modułów Vanilla JavaScript, a katalog produktów jest renderowany z lokalnego pliku `public/data/products.json`.

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

- Node.js `^20.19.0 || >=22.12.0` oraz npm,
- Vite 8.2.2 jako system development/build/preview,
- Prettier, ESLint, Stylelint i html-validate,
- własne walidatory linków wewnętrznych, JSON-LD, zasobów obrazów produktów i pakietu produkcyjnego oraz testy kontraktu budowania,
- Lighthouse do testów smoke,
- sharp, fast-glob i minimist w narzędziu optymalizacji obrazów.

### Architektura

- Projekt pozostaje Vanilla HTML/CSS/JavaScript MPA. Vite 8.2.2 obsługuje development, build i preview, automatycznie wykrywając wszystkie 15 dokumentów HTML w katalogu głównym i `pages/`.
- Wspólny renderer `scripts/html.mjs`, podłączony przez `scripts/vite-volt-garage.mjs`, rozwija `@include`, warunki i tokeny zarówno w trybie dev, jak i podczas budowania. Partiale `src/partials/header.html` i `src/partials/footer.html` pozostają źródłami; ich edycja przeładowuje stronę w dev. Brakujące lub niedozwolone include'y, cykle i nierozwiązane tokeny powodują błąd.
- `js/main.js` uruchamia moduły tylko dla elementów obecnych na bieżącej stronie. Funkcje katalogu i koszyka znajdują się w `js/features/`, dostęp do danych i pamięci w `js/services/`, a zachowania interfejsu w `js/ui/`.
- `public/data/products.json` jest kanonicznym źródłem katalogu, dostępnym pod `/data/products.json`. Fetch API pobiera dane z rewalidacją, a aplikacja przechowuje je w pamięci na czas bieżącej sesji strony.
- `css/main.css` importuje warstwy z `css/partials/`. Vite przetwarza CSS i moduły JS, minifikuje je oraz aktualizuje odwołania w produkcyjnym HTML.
- `public/` zawiera statyczne zasoby kopiowane bez zmiany nazw do `dist/`, z zachowaniem URL-i takich jak `/assets/`, `/data/products.json` i `/site.webmanifest`. Kanoniczny `src/sw.js` jest osobno przekształcany w produkcyjny `dist/sw.js`.

### Struktura projektu

```text
.
├── index.html                             # Strona główna i źródłowy entry HTML
├── 404.html, offline.html, thank-you.html # Pozostałe główne dokumenty HTML
├── pages/                                 # 11 widoków sklepu, kontaktu i stron prawnych
├── src/
│   ├── partials/                          # Współdzielone partiale headera i footera
│   └── sw.js                              # Kanoniczny Service Worker
├── css/
│   ├── main.css                           # Kanoniczny entry CSS
│   └── partials/                          # Warstwy stylów
├── js/
│   ├── main.js                            # Entry modułów aplikacji
│   ├── core/                              # Zdarzenia i obsługa błędów
│   ├── features/                          # Produkty, filtry i koszyk
│   ├── services/                          # Dane produktów i bezpieczny dostęp do storage
│   └── ui/                                # Nawigacja, motyw, dostępność, PWA i JSON-LD
├── public/                                # Zasoby kopiowane z zachowaniem publicznych URL-i
│   ├── assets/                            # Obrazy, fonty, ikony i warianty _optimized
│   ├── data/products.json                 # Lokalne dane produktowe
│   ├── site.webmanifest                   # Manifest aplikacji
│   ├── _headers, _redirects               # Nagłówki i reguła 404 dla Netlify
│   └── robots.txt, sitemap.xml            # Pliki statyczne serwisu
├── scripts/                               # Integracja Vite, renderer HTML, walidatory i testy
├── tools/image-optimizer/                 # Narzędzie generowania wariantów obrazów
├── vite.config.mjs                        # Konfiguracja Vite MPA
├── dist/                                  # Generowany pakiet produkcyjny; ignorowany przez Git
│   ├── build/                             # CSS/JS z hashem zawartości
│   ├── .vite/manifest.json                # Manifest wyników Vite
│   └── ...                                # HTML, kopie public/ i wygenerowany sw.js
├── package.json
└── LICENSE
```

### Instalacja

Wymagany jest Node.js w wersji zgodnej z `^20.19.0 || >=22.12.0`. Repozytorium używa npm i zawiera `package-lock.json`.

```bash
npm ci
```

### Tryb developerski

```bash
npm run dev
```

Vite udostępnia źródła domyślnie pod `http://127.0.0.1:5173`, obsługuje aktualizacje modułów i przeładowanie po zmianie partiali HTML. Port jest ścisły. Rejestracja Service Workera jest w dev wyłączona; obsługę PWA sprawdza się na buildzie produkcyjnym przez preview.

### Build produkcyjny

```bash
npm run build
npm run preview
```

`npm run build` odtwarza `dist/` z zachowaniem wszystkich tras HTML. CSS i JavaScript otrzymują nazwy z hashem zawartości w `dist/build/`, np. `main-[hash].css` i `main-[hash].js`. Build zapisuje też `dist/.vite/manifest.json`, kopiuje `public/`, generuje `dist/sw.js` i uruchamia walidację pakietu.

`npm run preview` udostępnia istniejący `dist/` przez Vite pod adresem `http://127.0.0.1:4173`; po zmianie źródeł należy ponownie wykonać build. Port jest ścisły: zajęty port powoduje błąd.

HTML, CSS i JS pozostają czytelnymi, nieminifikowanymi źródłami. Produkcyjne bundle powstają wyłącznie w `dist/`; cały ten katalog jest generowany, ignorowany przez Git i nie powinien być edytowany ręcznie.

### Testy i walidacja

```bash
npm run qa
npm run format:check
npm run build
npm run qa:package
npm run qa:smoke
npm run qa:smoke:enforce
```

- `npm run qa` sprawdza źródłowy HTML, JSON-LD, linki wewnętrzne, zasoby obrazów produktów (rastry oraz warianty AVIF/WebP), JavaScript, CSS oraz kontrakt budowania przez `qa:build`.
- `npm run format:check` weryfikuje formatowanie bez zapisu zmian.
- `npm run qa:build` uruchamia testy Node dla renderera HTML i kontraktu pakietu; można je wykonać również osobno.
- `npm run qa:package` sprawdza istniejący `dist/`, w tym trasy, odwołania do zasobów, hashowane bundle, manifesty i kopie plików publicznych. Ta sama walidacja jest automatyczną częścią `build`.
- `npm run qa:smoke` wykonuje świeży build, uruchamia Vite preview i audytuje stronę główną, katalog oraz stronę produktu przez zainstalowany Lighthouse. Domyślnie raportuje przekroczenia progów bez blokowania.
- `npm run qa:smoke:enforce` używa tego samego zakresu, ale zwraca błąd po niespełnieniu skonfigurowanych progów. Oba tryby wymagają dostępnego Chrome/Chromium i wolnego portu preview.

Są to skonfigurowane workflow jakości; repozytorium nie deklaruje pokrycia testami ani formalnej zgodności na podstawie samych skryptów. Dokładne komendy i ustawienia smoke opisuje [dokumentacja konfiguracji](docs/settings.md).

GitHub Actions uruchamia workflow `Quality` ([.github/workflows/quality.yml](.github/workflows/quality.yml)) automatycznie przy push do `main` oraz dla pull requestów kierowanych do `main`; można go też uruchomić ręcznie przez `workflow_dispatch`. Zadanie działa na Node.js 22 i wykonuje instalację z lockfile (`npm ci`), `npm run qa` i `npm run build`. Ta weryfikacja obejmuje wyłącznie jakość źródeł i budowanie pakietu: nie uruchamia sprawdzania formatowania ani testów smoke Lighthouse i nie wykonuje wdrożenia.

### Wdrożenie

Kontrakt budowania w Netlify: polecenie `npm run build`, katalog publikacji `dist`, Node.js zgodny z `^20.19.0 || >=22.12.0`. `dist/` zawiera wszystkie strony, hashowane bundle, wygenerowany `sw.js` i kopie zasobów z `public/`, w tym `site.webmanifest`, `robots.txt`, `sitemap.xml`, `_headers` i `_redirects`.

Publiczna wersja demonstracyjna jest hostowana w Netlify. Źródłowy `public/_headers` definiuje politykę CSP, podstawowe nagłówki ochronne i cache, a `public/_redirects` kieruje nieznalezione ścieżki do `404.html`. Roczne cache `immutable` dotyczy wyłącznie `/build/*`; HTML, `/assets/*`, `/data/*`, manifest i Service Worker wymagają rewalidacji.

Vite preview służy do lokalnej inspekcji pakietu i nie stosuje reguł Netlify z `_headers` ani `_redirects`. Dokumentacja opisuje konfigurację wdrożenia; nie potwierdza wdrożenia migracji ani działania nagłówków, przekierowań czy formularzy w Netlify. Repozytorium nie zawiera polecenia wdrożeniowego: wdrożenie pozostaje ręczne i poza GitHub Actions, gdzie workflow `Quality` prowadzi wyłącznie weryfikację jakości (CI).

### Dostępność

Implementacja zawiera konkretne mechanizmy dostępności, bez deklarowania formalnej zgodności WCAG:

- skip link do `#main`, semantyczne landmarki i natywne kontrolki,
- nawigację rozwijaną z synchronizacją `aria-expanded`, obsługą `Escape` i klawiszy strzałek,
- style `:focus-visible` i rozpoznawanie nawigacji klawiaturą,
- focus trap i przywracanie fokusu dla modalu informacyjnego,
- `prefers-reduced-motion` dla ograniczenia animacji,
- stany `aria-busy`, regiony `aria-live` oraz formularze z `aria-invalid` i `aria-describedby`.

### SEO

Dokumenty HTML zawierają tytuły, opisy, adresy canonical, metadane Open Graph i Twitter Cards. Strona główna udostępnia statyczne dane `OnlineStore` i `WebSite`, a JavaScript generuje `BreadcrumbList`, `ItemList` i `Product` zależnie od widoku. Repozytorium zawiera również `public/robots.txt`, `public/sitemap.xml` i obrazy social preview w `public/assets/images/og/`.

Te mechanizmy opisują warstwę metadanych; nie stanowią deklaracji wyników pozycjonowania.

### PWA i obsługa offline

`public/site.webmanifest`, dostępny pod `/site.webmanifest`, definiuje tryb `standalone`, ikony, skróty oraz zrzuty ekranu. `js/main.js` rejestruje `/sw.js` wyłącznie w buildzie produkcyjnym, z `updateViaCache: 'none'`. Moduł `js/ui/pwa-prompts.js` obsługuje zdarzenia instalacji, zmianę stanu online/offline i komunikat o dostępnej aktualizacji.

Zaproszenie do instalacji pojawia się jako kompaktowa karta przy dolnej krawędzi (na desktopie po prawej stronie, na wąskich ekranach jako karta u dołu z marginesami bezpiecznego obszaru). Po około 30 sekundach bez decyzji karta zwija się do małego przycisku „VOLT APP”, który pozostaje widoczny i po kliknięciu lub aktywacji z klawiatury ponownie ją otwiera. Automatyczne zwinięcie nie jest odmową: odroczone zdarzenie instalacji pozostaje dostępne. Jeśli w momencie upływu czasu fokus znajduje się wewnątrz karty, zwinięcie czeka na opuszczenie komponentu. Wybranie „Nie teraz” ukrywa zaproszenie do końca bieżącej sesji przeglądarki; „Zainstaluj” uruchamia natywne okno instalacji przeglądarki.

Pierwsza instalacja i przejęcie kontroli nad stroną nie wymuszają przeładowania ani komunikatu o aktualizacji. Gdy otwarta strona jest już kontrolowana, nowy worker czeka, a aplikacja pokazuje powiadomienie o dostępnej wersji. Dopiero wybranie „Odśwież” uruchamia aktywację oczekującego workera; po przejęciu kontroli karta, w której wybrano tę akcję, przeładowuje się raz, aby użyć nowej wersji. Bez tej akcji strona nie przeładowuje się automatycznie.

Kanoniczny worker znajduje się w `src/sw.js`. Integracja Vite generuje `dist/sw.js`, wstrzykując identyfikator wdrożenia obliczony z zawartości wyników budowania, plików `public/` i źródła workera oraz listę precache. Zwykła zmiana zawartości nie wymaga ręcznego numerowania wydania; `CACHE_SCHEMA` opisuje zmiany kontraktu cache.

Precache obejmuje `/`, `/offline.html`, wygenerowane bundle, lokalne fonty i logotypy. Nawigacja i zasoby o stałych URL-ach korzystają z network-first z rewalidacją i fallbackiem do cache; hashowane CSS/JS z `/build/` korzystają z cache-first. Cache runtime ma limity 20 dokumentów i 60 zasobów. Aktywacja usuwa wyłącznie nieaktualne cache z prefiksem `volt-garage-`.

Obsługa offline jest częściowa: zależy od wcześniejszej instalacji Service Workera i zapisanej zawartości. Przy niedostępnej sieci worker zwraca zapisaną stronę albo `/offline.html`; nie gwarantuje dostępności wszystkich tras przy pierwszej wizycie offline.

### Wydajność

- Vite łączy i minifikuje CSS oraz JavaScript, nadając plikom wynikowym hashe zawartości.
- Hero używa responsywnego `srcset` oraz formatów AVIF/WebP z fallbackiem JPG.
- Karty produktów używają AVIF/WebP z fallbackiem JPG/PNG, lazy loadingiem, asynchronicznym dekodowaniem i zadeklarowanymi wymiarami.
- Lokalne fonty WOFF2 korzystają z `font-display: swap`; strona główna preloaduje kluczowy font i obraz hero.
- `public/_headers` ustawia roczne cache `immutable` wyłącznie dla `/build/*`; HTML i zasoby o stałych URL-ach podlegają rewalidacji.

Repozytorium nie przechowuje w README aktualnych wyników Lighthouse ani Core Web Vitals.

### Dane i trwałość stanu

- Katalog produktów pochodzi wyłącznie z `public/data/products.json`; aplikacja nie pobiera go z zewnętrznego API.
- Koszyk (`volt_cart`), motyw (`vg_theme`), akceptacja modalu projektu i zakończona instalacja aplikacji (`vg_install_cta_dismissed`) są zapisywane lokalnie w przeglądarce.
- Wybranie „Nie teraz” w zaproszeniu do instalacji zapisuje `vg_install_cta_session_dismissed` w `sessionStorage`, więc obowiązuje tylko do zamknięcia karty. Przy zablokowanym magazynie zapis jest pomijany bez błędu.
- Formularz kontaktowy ma konfigurację Netlify Forms i po poprawnej walidacji korzysta z natywnego żądania `POST`.
- Formularz checkoutu wyświetla lokalny komunikat powodzenia i resetuje pola. Nie zapisuje ani nie wysyła zamówienia i nie obsługuje płatności.

Projekt nie implementuje bazy danych, uwierzytelniania, kont użytkowników ani synchronizacji między urządzeniami.

### Utrzymanie projektu

- Zmiany wspólnego headera lub footera należy wprowadzać w `src/partials/`; Vite rozwija je w dev i podczas budowania.
- Zmiany katalogu produktów należy wprowadzać w `public/data/products.json`; widoki produktów i dane strukturalne są budowane z tego źródła w runtime.
- Build i walidatory odkrywają dokumenty przez `*.html` i `pages/**/*.html`. Po zmianie tras trzeba nadal zaktualizować linki, `public/sitemap.xml`, skróty w `public/site.webmanifest` oraz zakres smoke, jeśli dotyczy.
- Pełnowymiarowe źródła zdjęć produktów znajdują się w niepublikowanym `src/assets/images/products/`. Służą do generowania pomniejszonych fallbacków JPG/PNG pod dotychczasowymi URL-ami w `public/assets/images/products/` oraz wariantów WebP/AVIF w `public/assets/images/_optimized/products/`. Pozostałe źródła obrazów pozostają w `public/assets/images/`. [Dokumentacja narzędzia](tools/image-optimizer/README.md) opisuje oba polecenia generowania; build kopiuje gotowe zasoby z `public/` i nie uruchamia optymalizatora.
- `dist/` jest generowanym wynikiem. Kanonicznymi źródłami pozostają HTML, `src/partials/`, `src/sw.js`, `css/main.css`, `css/partials/`, `js/main.js` wraz z importowanymi modułami oraz zasoby w `public/`.

### Licencja

Kod i materiały należące do właściciela projektu są udostępniane na warunkach **Własnościowej Licencji Projektu KP_CODE, wersja 1.0**. Projekt nie jest oprogramowaniem open source. Szczegółowe dozwolone użycie, ograniczenia i zasady dotyczące materiałów podmiotów trzecich znajdują się w pliku [LICENSE](LICENSE).

Dołączone fonty podmiotów trzecich nie są objęte tą licencją i pozostają na warunkach własnych licencji. Noty dotyczące tych zasobów, informacje o prawach autorskich oraz lokalizacja pełnych tekstów licencji są opisane w pliku [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## EN

### Project Overview

Volt Garage is a demonstrational, static front-end for a multi-page automotive accessories store, created as a KP_Code Digital Studio portfolio project. Its source layer uses HTML, CSS, and Vanilla JavaScript modules, while the product catalog is rendered from the local `public/data/products.json` file.

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

- Node.js `^20.19.0 || >=22.12.0` and npm,
- Vite 8.2.2 as the development/build/preview system,
- Prettier, ESLint, Stylelint, and html-validate,
- custom internal-link, JSON-LD, product-image-asset, and production-package validators, plus build-contract tests,
- Lighthouse for smoke checks,
- sharp, fast-glob, and minimist in the image optimization tool.

### Architecture

- The project remains a Vanilla HTML/CSS/JavaScript MPA. Vite 8.2.2 handles development, build, and preview, automatically discovering all 15 HTML documents in the repository root and `pages/`.
- The shared `scripts/html.mjs` renderer, integrated through `scripts/vite-volt-garage.mjs`, expands `@include`, conditionals, and tokens in both dev and production builds. The `src/partials/header.html` and `src/partials/footer.html` partials remain source files; editing them reloads the page in dev. Missing or disallowed includes, cycles, and unresolved tokens fail validation.
- `js/main.js` initializes modules only for elements present on the current page. Catalog and cart features live in `js/features/`, data and storage access in `js/services/`, and interface behavior in `js/ui/`.
- `public/data/products.json` is the canonical catalog source, served at `/data/products.json`. The Fetch API retrieves it with revalidation, and the application holds it in memory for the current page session.
- `css/main.css` imports layers from `css/partials/`. Vite processes CSS and JS modules, minifies them, and updates references in production HTML.
- `public/` holds static resources copied without renaming into `dist/`, preserving URLs such as `/assets/`, `/data/products.json`, and `/site.webmanifest`. The canonical `src/sw.js` is separately transformed into production `dist/sw.js`.

### Project Structure

```text
.
├── index.html                             # Homepage and source HTML entry
├── 404.html, offline.html, thank-you.html # Other root HTML documents
├── pages/                                 # 11 store, contact, and legal views
├── src/
│   ├── partials/                          # Shared header and footer partials
│   └── sw.js                              # Canonical Service Worker
├── css/
│   ├── main.css                           # Canonical CSS entry
│   └── partials/                          # Style layers
├── js/
│   ├── main.js                            # Application module entry
│   ├── core/                              # Events and error handling
│   ├── features/                          # Products, filters, and cart
│   ├── services/                          # Product data and safe storage access
│   └── ui/                                # Navigation, theme, accessibility, PWA, and JSON-LD
├── public/                                # Resources copied with public URLs preserved
│   ├── assets/                            # Images, fonts, icons, and _optimized variants
│   ├── data/products.json                 # Local product data
│   ├── site.webmanifest                   # Application manifest
│   ├── _headers, _redirects               # Netlify headers and 404 rule
│   └── robots.txt, sitemap.xml            # Static site files
├── scripts/                               # Vite integration, HTML renderer, validators, and tests
├── tools/image-optimizer/                 # Image variant generation tool
├── vite.config.mjs                        # Vite MPA configuration
├── dist/                                  # Generated production package; ignored by Git
│   ├── build/                             # Content-hashed CSS/JS
│   ├── .vite/manifest.json                # Vite output manifest
│   └── ...                                # HTML, public/ copies, and generated sw.js
├── package.json
└── LICENSE
```

### Installation

Node.js compatible with `^20.19.0 || >=22.12.0` is required. The repository uses npm and includes `package-lock.json`.

```bash
npm ci
```

### Development

```bash
npm run dev
```

Vite serves source files at `http://127.0.0.1:5173` by default, with module updates and reloads after HTML partial changes. The port is strict. Service Worker registration is disabled in dev; check PWA behavior against a production build through preview.

### Production Build

```bash
npm run build
npm run preview
```

`npm run build` recreates `dist/` while preserving every HTML route. CSS and JavaScript receive content-hashed filenames in `dist/build/`, such as `main-[hash].css` and `main-[hash].js`. The build also writes `dist/.vite/manifest.json`, copies `public/`, generates `dist/sw.js`, and runs package validation.

`npm run preview` serves the existing `dist/` through Vite at `http://127.0.0.1:4173`; rebuild after source changes. The port is strict: an occupied port causes a failure.

HTML, CSS, and JS remain readable, unminified sources. Production bundles are emitted only into `dist/`; the entire directory is generated, ignored by Git, and should not be edited manually.

### Testing and Validation

```bash
npm run qa
npm run format:check
npm run build
npm run qa:package
npm run qa:smoke
npm run qa:smoke:enforce
```

- `npm run qa` checks source HTML, JSON-LD, internal links, product image assets (rasters and AVIF/WebP variants), JavaScript, CSS, and the build contract through `qa:build`.
- `npm run format:check` verifies formatting without writing changes.
- `npm run qa:build` runs Node tests for the HTML renderer and package contract; it can also be run separately.
- `npm run qa:package` checks the existing `dist/`, including routes, asset references, hashed bundles, manifests, and public-file copies. The same validation runs automatically as part of `build`.
- `npm run qa:smoke` creates a fresh build, starts Vite preview, and audits the homepage, catalog, and product page using the installed Lighthouse dependency. Threshold misses are reported without blocking by default.
- `npm run qa:smoke:enforce` uses the same scope but returns a failure when configured thresholds are not met. Both modes require an available Chrome/Chromium installation and a free preview port.

These are configured quality workflows; their presence alone does not establish test coverage or formal compliance. Exact commands and smoke settings are documented in [project settings](docs/settings.md).

GitHub Actions runs the `Quality` workflow ([.github/workflows/quality.yml](.github/workflows/quality.yml)) automatically on pushes to `main` and on pull requests targeting `main`; it can also be started manually through `workflow_dispatch`. The job runs on Node.js 22 and performs a locked install (`npm ci`), `npm run qa`, and `npm run build`. This verification covers source quality and the package build only: it does not run the formatting check or the Lighthouse smoke tests, and it does not deploy.

### Deployment

The Netlify build contract is `npm run build`, publish directory `dist`, and Node.js compatible with `^20.19.0 || >=22.12.0`. `dist/` contains every page, hashed bundles, the generated `sw.js`, and copies of resources from `public/`, including `site.webmanifest`, `robots.txt`, `sitemap.xml`, `_headers`, and `_redirects`.

The public demo is hosted on Netlify. Source `public/_headers` defines a CSP, baseline protective headers, and caching, while `public/_redirects` sends unresolved paths to `404.html`. One-year `immutable` caching applies only to `/build/*`; HTML, `/assets/*`, `/data/*`, the manifest, and the Service Worker must revalidate.

Vite preview supports local package inspection and does not apply Netlify rules from `_headers` or `_redirects`. This documents deployment configuration; it does not confirm deployment of the migration or Netlify header, redirect, or form behavior. The repository does not contain a deployment command: deployment stays manual and outside GitHub Actions, where the `Quality` workflow performs quality verification (CI) only.

### Accessibility

The implementation includes concrete accessibility mechanisms without claiming formal WCAG compliance:

- a skip link to `#main`, semantic landmarks, and native controls,
- dropdown navigation with synchronized `aria-expanded`, `Escape`, and arrow-key handling,
- `:focus-visible` styles and keyboard-navigation detection,
- a focus trap and focus restoration for the informational modal,
- `prefers-reduced-motion` behavior,
- `aria-busy` states, `aria-live` regions, and forms using `aria-invalid` and `aria-describedby`.

### SEO

The HTML documents contain titles, descriptions, canonical URLs, Open Graph metadata, and Twitter Cards. The homepage exposes static `OnlineStore` and `WebSite` data, while JavaScript generates `BreadcrumbList`, `ItemList`, and `Product` data for the relevant views. The repository also includes `public/robots.txt`, `public/sitemap.xml`, and social preview images in `public/assets/images/og/`.

These mechanisms describe the metadata layer; they do not claim search-ranking results.

### PWA and Offline Support

`public/site.webmanifest`, served at `/site.webmanifest`, defines `standalone` display mode, icons, shortcuts, and screenshots. `js/main.js` registers `/sw.js` only in production builds, with `updateViaCache: 'none'`. The `js/ui/pwa-prompts.js` module handles installation events, online/offline status changes, and update messaging.

The first installation and acquisition of page control trigger neither a reload nor an update notification. While an open page is already controlled, a new worker waits and the app shows an update notification. Choosing “Odśwież” (Refresh) activates the waiting worker; once it takes control, the tab where the action was chosen reloads once to use the new version. Without that action, the page does not reload automatically.

The canonical worker is `src/sw.js`. The Vite integration generates `dist/sw.js`, injecting a deployment ID derived from build-output content, `public/` files, and worker source, together with the precache list. Ordinary content changes require no manual release counter; `CACHE_SCHEMA` describes cache-contract changes.

Precache includes `/`, `/offline.html`, generated bundles, local fonts, and logos. Navigation and stable-URL resources use network-first with revalidation and a cached fallback; hashed CSS/JS under `/build/` use cache-first. Runtime caches are limited to 20 documents and 60 resources. Activation removes only obsolete caches prefixed with `volt-garage-`.

Offline support is partial: it depends on prior Service Worker installation and stored content. When the network is unavailable, the worker returns a cached page or `/offline.html`; it does not guarantee that every route is available on a first offline visit.

### Performance

- Vite bundles and minifies CSS and JavaScript, assigning content hashes to output filenames.
- The hero uses responsive `srcset` resources and AVIF/WebP formats with a JPG fallback.
- Product cards use AVIF/WebP with JPG/PNG fallbacks, lazy loading, asynchronous decoding, and declared dimensions.
- Local WOFF2 fonts use `font-display: swap`; the homepage preloads a key font and hero image.
- `public/_headers` sets one-year `immutable` caching only for `/build/*`; HTML and stable-URL resources revalidate.

The repository does not record current Lighthouse or Core Web Vitals results in this README.

### Data and State Persistence

- The product catalog comes exclusively from `public/data/products.json`; the application does not retrieve it from an external API.
- The cart (`volt_cart`), theme (`vg_theme`), project-modal acceptance, and install-prompt dismissal are persisted locally in the browser.
- The contact form is configured for Netlify Forms and uses a native `POST` request after successful validation.
- The checkout form displays a local success message and resets its fields. It does not persist or transmit an order and does not process payments.

The project does not implement a database, authentication, user accounts, or cross-device synchronization.

### Project Maintenance

- Shared header or footer changes belong in `src/partials/`; Vite expands them in dev and during the build.
- Catalog changes belong in `public/data/products.json`; product views and structured data are built from this source at runtime.
- The build and validators discover documents through `*.html` and `pages/**/*.html`. Route changes still require updates to links, `public/sitemap.xml`, shortcuts in `public/site.webmanifest`, and the smoke scope where relevant.
- Full-resolution product masters live in the unpublished `src/assets/images/products/`. They generate reduced JPG/PNG fallbacks at the existing URLs in `public/assets/images/products/` and WebP/AVIF variants in `public/assets/images/_optimized/products/`. Other image sources remain in `public/assets/images/`. The [tool documentation](tools/image-optimizer/README.md) describes both generation commands; the build copies prepared resources from `public/` and does not run the optimizer.
- `dist/` is generated output. The canonical sources remain the HTML documents, `src/partials/`, `src/sw.js`, `css/main.css`, `css/partials/`, `js/main.js` with its imported modules, and resources in `public/`.

### License

Code and materials owned by the project owner are provided under the **KP_CODE Proprietary Project License, version 1.0**. The project is not open-source software. Detailed permitted uses, restrictions, and rules for third-party materials are defined in [LICENSE](LICENSE).

Bundled third-party fonts are not covered by that license and remain subject to their own terms. Notices for those assets, their copyright information, and the location of the full license texts are recorded in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
