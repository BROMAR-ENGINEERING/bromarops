# Bromar Ops — Starter Framework

## Structure
```
bromar-ops/
├── index.html              ← Dashboard
├── css/styles.css          ← Shared global styles + theme
├── js/core.js              ← Shared layout, theme, version, sidebar, header
└── assets/
    ├── Bromar-Primary-Logo-Full-Colour.png      (light mode)
    └── Bromar-Primary-Logo-Reverse-White.png    (dark mode)
```

## Adding a new page
1. Copy `index.html`, rename (e.g. `jobs.html`).
2. Change the `BromarOps.init({...})` call:
   - `page:` matches a nav `id` (e.g. `'jobs'`)
   - `title:` page heading
   - `content:` your page HTML

Logos must be placed in `/assets/` with the exact filenames above.

## Versioning
- Version is shown bottom-right of every page in format **VX.XX**.
- Starts at **V1.00**, auto-increments by `0.01` on every page load.
- For a **major version bump** (e.g. `V1.09 → V2.00`), open the browser console and run:
  ```js
  BromarOps.majorVersionBump();
  ```
- Version persists in `localStorage`. To reset, run:
  ```js
  localStorage.removeItem('bromar_ops_version');
  ```

## Theme
- Toggle button is top-right of header.
- Logo automatically swaps between full-colour (light) and reverse-white (dark).
- Preference persists in `localStorage`.

## Home button
- Top-left of header, navigates to `index.html`.
