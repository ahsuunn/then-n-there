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
    peaks.js              Overpass proxy, mirrors, 24h cache
  public/
    index.html            editor
    share.html            share view
    css/app.css           tokens and editor styles
    js/state.js           single app state store with set() and subscribe()
    js/fields.js          field registry builder (EXIF + context)
    js/exif.js            exifr wrapper, returns the EXIF contract
    js/reconstruct.js     the lookups, independent, cached
    js/wmo.js             weather code text
    js/editor.js          editor wiring: sidebar, toggles, canvas
    js/ui.js              dom helpers, toasts, loading states
    js/share.js           share view
  data/                   gitignored: app.db, uploads/
```

The HUD renderer will live in `js/hud.js` and is shared by `index.html` and
`share.html`. `js/fields.js` is the only place that decides which fields exist.

## Rules

- One phase per session. Do not run two phases in one prompt.
- Every phase ends with a working app, a commit, and a manual check.
- A new dependency (anything beyond `express`, `multer`, `better-sqlite3`,
  `exifr`, `leaflet`, `suncalc`) requires a note in the README before it is
  added.
- Do not touch `data/` or `.gitignore`.

## Commit rules

- Commits are modular: one concern per commit, conventional prefix, imperative
  subject.
- Never bundle a feature into one commit. Split it into its parts and commit
  each: the module, the route that exposes it, the client that calls it, and the
  documentation that records it. A commit that touches `server/`, `public/` and
  `README.md` at once is almost always three commits wearing one message.
- Fixes that follow a feature go in their own commit, with the symptom in the
  body.
- Documentation changes are their own commit unless the change is a code comment.

## Overpass and the peaks lookup

- Never call an Overpass host from client code. Only one public instance sends
  CORS headers, and all of them answer 502 when their workers are full, so a
  browser request fails unpredictably.
- Peaks are resolved through `GET /api/peaks?lat=&lon=&radius=` on this server,
  which rotates three mirrors, retries with backoff, validates the coordinates
  and caches each answer for a day. Keep that path: the cache is what makes the
  field survive a bad afternoon on the public instances.
- When Overpass is down the row must degrade to a specific reason, never a
  spinner that never resolves.
