# Third-Party Notices

Volt Garage bundles third-party font software under `public/assets/fonts/`. That software is
**not** covered by the KP_CODE Proprietary Project License that governs this project. Rights to
it remain with its respective authors, and it is used under its own license, as stated in
section 8 ("Third-party materials" / "Materiały podmiotów trzecich") of [LICENSE](LICENSE).

The complete license text for each family is stored next to that family's font files.

---

## Manrope

- **Bundled files:** `Manrope-400.woff2`, `Manrope-500.woff2`, `Manrope-600.woff2`,
  `Manrope-700.woff2` in [`public/assets/fonts/manrope/`](public/assets/fonts/manrope)
- **Designer:** Mikhail Sharanda
- **Copyright:** `Copyright 2018 The Manrope Project Authors (https://github.com/sharanda/manrope)`
  as stated in the upstream license file. The bundled binaries record
  `Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)` in their
  embedded `name` table; the two upstream records differ only in the year.
- **License:** SIL Open Font License, Version 1.1 (26 February 2007)
- **Full license text:** [`public/assets/fonts/manrope/OFL.txt`](public/assets/fonts/manrope/OFL.txt)
- **Upstream source:** project repository <https://github.com/aaronbell/manrope>, recorded as the
  current source by the Google Fonts catalog entry
  <https://github.com/google/fonts/tree/main/ofl/manrope>. The address inside the copyright notice
  (`https://github.com/sharanda/manrope`) no longer resolves.
- **Bundled version:** 4.504. Each bundled file is an unmodified upstream static WOFF2 taken from
  `fonts/webfonts/` in the repository above, renamed to the weight it declares:
  `Manrope-Regular.woff2` → `Manrope-400.woff2`, `Manrope-Medium.woff2` → `Manrope-500.woff2`,
  `Manrope-SemiBold.woff2` → `Manrope-600.woff2` and `Manrope-Bold.woff2` → `Manrope-700.woff2`.
  The bytes are unchanged, so each file carries the full upstream character set and its own
  `usWeightClass` (400, 500, 600, 700); the names match the `@font-face` weights declared in
  `css/partials/themes.css`.

## Space Grotesk

- **Bundled file:** `SpaceGrotesk-Variable.woff2` in
  [`public/assets/fonts/space-grotesk/`](public/assets/fonts/space-grotesk)
- **Designer:** Florian Karsten
- **Copyright:**
  `Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)`
  as stated in both the upstream license file and the embedded `name` table of the bundled binary.
- **License:** SIL Open Font License, Version 1.1 (26 February 2007)
- **Full license text:**
  [`public/assets/fonts/space-grotesk/OFL.txt`](public/assets/fonts/space-grotesk/OFL.txt)
- **Upstream source:** project repository <https://github.com/floriankarsten/space-grotesk>; Google
  Fonts catalog entry <https://github.com/google/fonts/tree/main/ofl/spacegrotesk>.
- **Bundled version:** 2.000. The bundled file is the upstream variable font (weight axis
  300–700), copied verbatim from `fonts/woff2/SpaceGrotesk[wght].woff2` in the repository above.
