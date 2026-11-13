# Then & There: agent constraints

Handover document for coding agents working on this repository. Read this
before changing anything, together with PLAN.md.

## Non-negotiable constraints

- Vanilla HTML, CSS, and JavaScript with ES modules. No framework (no React,
  Vue, Svelte, Next). No bundler, no build step, no TypeScript. The browser
  loads the source files directly.
- Server: Node.js + Express, single process, serves the static client and the
  JSON API. No transpilation.
- Database: SQLite. Prefer `better-sqlite3`; if the native build fails on
  Node 22, fall back to `node:sqlite` with `--experimental-sqlite` and record
  the flag in the `package.json` scripts.
- Libraries allowed, loaded from CDN or npm: `exifr` (EXIF), `leaflet` (map),
  `suncalc` (sun and moon). Nothing else without asking.
- All data sources are keyless and public. No API keys, no secrets, no `.env`
  values in the repo. Every request carries an honest `User-Agent` such as
  `then-n-there/0.1 (student project)`.
- No em dashes in user-facing copy. No emoji in the UI.
- Everything the app writes at runtime goes under `data/`, which is gitignored.

## File layout

```
then-n-there/
  package.json            scripts: start, dev, smoke
  AGENTS.md               this file
  PLAN.md                 the build plan
  README.md               what it is, how to run, data source credits
  server/
    index.js              express app, static, API
    db.js                 sqlite open + schema + queries
    uploads.js            multer config, mime sniff, size cap
    slug.js               slug generation
  public/
    index.html            editor
    share.html            share view
    css/app.css
    js/main.js            editor wiring
    js/exif.js            exifr wrapper, returns the EXIF contract
    js/reconstruct.js     the four lookups, independent, cached
    js/map.js             leaflet setup, pin drag, picker fallback
    js/hud.js             canvas renderer, shared by editor and share view
    js/export.js          native-resolution render, toBlob, download
    js/wmo.js             weather code text
    js/ui.js              dom helpers, toasts, loading states
  data/                   gitignored: app.db, uploads/
```

`js/hud.js` is the single renderer used by both `index.html` and `share.html`.

## Rules

- One phase per session. Do not run two phases in one prompt.
- Every phase ends with a working app, a commit, and a manual check.
- A new dependency (anything beyond `express`, `multer`, `better-sqlite3`,
  `exifr`, `leaflet`, `suncalc`) requires a note in the README before it is
  added.
- Do not touch `data/` or `.gitignore`.
- Commit after each phase with a conventional commit message.
