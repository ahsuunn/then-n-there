# Then & There: build plan

Web Programming 2026 final assignment. Based on proposal #25 "Photo Map Tracker"
by 류수민, extended with a share service.

Purpose of this file: it is the handover document for an autonomous coding agent
(OpenCode). It states the scope, the constraints, the data contracts, the visual
direction, and the phase order. Each phase is independently shippable and must
be verified before the next one starts.

---

## 1. Product

An editor. Open it, drop a photo, and the app reads the EXIF anchors (GPS,
capture time, altitude, camera bearing, exposure), reconstructs the context that
was never in the file (place, weather at that hour, ground elevation, named
peaks in the facing direction, sun and moon position), and composites that
context onto the photo as a canvas HUD. Toggle fields in the sidebar and the
preview updates immediately. Export the result, or mint a share link.

Three surfaces:

- `/` editor: top bar, left sidebar of switches grouped by provenance, canvas in
  the centre. Uploading never navigates away from the editor.
- `/s/:slug` share view: read-only render of a saved export, download and a
  footnote. No editor controls, ever.
- gallery list in the editor sidebar footer: recent saves on this device.

## 2. Constraints (non-negotiable)

- Vanilla HTML, CSS, and JavaScript with ES modules. **No framework** (no React,
  Vue, Svelte, Next). **No bundler, no build step, no TypeScript.** The browser
  loads the source files directly.
- Server: Node.js + Express, single process, serves the static client and the
  JSON API. No transpilation.
- Database: SQLite via `better-sqlite3`.
- Libraries allowed, loaded from CDN: `exifr` (EXIF), `leaflet` (map),
  `suncalc` (sun and moon). Nothing else without asking.
- All data sources are keyless and public. **No API keys, no secrets, no `.env`
  values in the repo.** Every request carries an honest `User-Agent` such as
  `then-n-there/0.1 (student project)`.
- No em dashes in user-facing copy. No emoji in the UI.
- Everything the app writes at runtime goes under `data/`, which is gitignored.

## 3. External data sources (all verified reachable, all keyless)

| Purpose | Endpoint | Notes |
|---|---|---|
| Reverse geocode | `GET https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lon}&localityLanguage=en` | CORS `*`. Returns `city`, `locality`, `principalSubdivision`, `countryName`. |
| Historical weather | `GET https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&hourly=temperature_2m,weather_code,wind_speed_10m,cloud_cover&timezone=auto` | Archive covers 1940 to today. `timezone=auto` returns local ISO hours, which matches EXIF local time. Pick the hour equal to `DateTimeOriginal`, or round to nearest. |
| Ground elevation | `GET https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}` | Returns `elevation[0]` in metres. |
| Named peaks | `POST https://overpass-api.de/api/interpreter` body `data=[out:json][timeout:20];node["natural"="peak"](around:15000,{lat},{lon});out body 50;` | Filter by bearing within ±25 degrees and rank by distance. **This host returns 502 under load**: retry with exponential backoff (1s, 2s, 4s), 20s timeout, cache 24h, degrade silently. If CORS blocks the browser request, add a thin `/api/peaks` proxy on the server and note it in the README. |
| Sun and moon | `SunCalc` from CDN | Computed locally from lat/lon/time. No network call. |
| Map tiles | OpenStreetMap tiles via Leaflet | Set a proper attribution string. |

WMO `weather_code` to human text mapping lives in one module, `js/wmo.js`.

## 4. Data contracts

EXIF contract (all fields optional, every lookup independent):

```
{ latitude, longitude, capturedAt (ISO local), offset (e.g. "+09:00" | null),
  altitude, bearing, focalLength, fNumber, exposureTime, iso, make, model,
  width, height }
```

Resolved context snapshot, saved with the gallery so a share page renders
without re-querying the network:

```
{ place: {name, admin, country} | null,
  weather: {tempC, code, wind, cloud} | null,
  elevation: number | null,
  peaks: [{name, distanceKm, bearingDeg, elevation}] | [],
  sun: {sunrise, sunset, solarAzimuth, isGoldenHour},
  moon: {phase, illumination} }
```

Field registry, the single source of truth for sidebar rows and HUD content. One
entry per displayable field:

```
{ id: "time", group: "source" | "derived", label: "Captured",
  value: string | null, format: "clock" | "place" | "temp" | "metres" | ...,
  available: boolean, reason: string | null, enabled: boolean }
```

Rules: a field that cannot be resolved is rendered **disabled with its reason**,
never hidden. The sidebar and the HUD both read this registry; neither hardcodes
a field list.

HUD config:

```
{ preset: "plate" | "corner" | "strip", x, y, width, tone: "light" | "dark",
  accent: "#hex", fontScale, opacity,
  fields: ["time","place","weather","elevation","peaks","sun"],
  align: "left" | "right" }
```

Saved record:

```
{ slug, createdAt, imagePath, imageWidth, imageHeight, hudConfig, context }
```

## 5. File layout

```
then-n-there/
  package.json            scripts: start, dev, smoke
  AGENTS.md               constraints for coding agents
  PLAN.md                 this file
  README.md               what it is, how to run, data source credits
  server/
    index.js              express app, static, API
    db.js                 sqlite open + schema + queries
    uploads.js            multer config, mime sniff, size cap
    slug.js               slug generation
  public/
    index.html            editor
    share.html            share view
    css/app.css           tokens and all editor styles
    js/state.js           one app state object with subscribe()
    js/fields.js          field registry builder (EXIF + context -> fields)
    js/exif.js            exifr wrapper, returns the EXIF contract
    js/reconstruct.js     the four lookups, independent, cached
    js/map.js             leaflet overlay, pin drag, picker fallback
    js/hud.js             canvas renderer, shared by editor and share view
    js/export.js          native-resolution render, toBlob, download
    js/editor.js          editor wiring: sidebar, toggles, canvas lifecycle
    js/wmo.js             weather code text
    js/ui.js              dom helpers, toasts, loading states
  data/                   gitignored: app.db, uploads/
```

`js/hud.js` is the single renderer for both pages. `js/fields.js` is the single
field list for both pages. Two renderers or two field lists means the share view
drifts from the editor.

## 6. Visual direction

Read this before writing any CSS. It exists to stop the interface from looking
like a generated landing page.

**Surface archetype: Command / Inspect.** The user is driving one object, a
photo, and drilling into its properties. Density and focus beat breadth. This is
the opposite of a marketing surface: no hero, no feature cards, no centred
stack.

Layout: top bar 48px, left sidebar 320px with its own scroll, canvas fills the
rest. Below 900px the sidebar becomes a bottom sheet and the canvas keeps its
aspect ratio with letterboxing.

Tokens, defined once in `:root` and used everywhere:

```
--bg      #0b0c0e     near-black page
--surface #14161a     panels
--raised  #1c1f24     controls, hover
--line    #2a2e35     borders, always 1px
--ink     #e8eaed     primary text
--muted   #9aa1ab     labels, units
--accent  #f0a75c     sodium amber, the single accent
--danger  #e5645f     unavailable, errors
```

Amber is deliberate: it is the colour of lamp-lit instrument panels, it belongs
to the subject, and it is not the default indigo that makes an interface read as
generated.

Type: Geist Sans for interface text, Geist Mono for every number, unit, label and
slug. Sizes 12 / 13 / 14 / 20 / 28. Numerals carry the personality of this
product, so set them tabular and slightly tight.

Shape and motion: 6px radius on controls, 10px on panels, 1px borders instead of
shadows, 140ms ease-out on state changes only, nothing on load.

Banned, because each is a tell: gradient backgrounds, glassmorphism, emoji,
rounded-square icon toppers, three equal feature cards, a centred stack, drop
shadows as the only hierarchy, and any purple or indigo accent.

The sidebar has three labelled groups in this order: SOURCE, DERIVED, STYLE. Each
row is a switch, a label, and a value in mono on the right. Unavailable rows are
dimmed with the reason in place of the value. The canvas sits on the neutral
backdrop with a 1px border, so a white photo does not blend into the page.

## 7. Phases

Each phase ends with a working app, a commit, and a manual check.

### Phase 0: scaffolding (done)

package.json, .gitignore, AGENTS.md, minimal express server, placeholder page.
Commit `chore(scaffold)`.

### Phase 1: vertical slice (done)

POST /api/galleries with magic-byte validation, SQLite schema, GET
/api/galleries/:slug, /s/:slug, drop-zone editor, share view with a placeholder
plate. Commits from `feat(db)` through `test:`.

### Phase 2: editor shell and EXIF intake (done)

This phase replaces the drop-zone page with the editor described in section 6,
and makes the photo's own data visible. The server is not touched.

- Layout: 48px top bar (name left, actions right), 320px sidebar, canvas area.
  Below 900px the sidebar collapses to a bottom sheet. No horizontal scroll at
  any width.
- Drop anywhere on the window, plus a file picker button in the top bar. On
  selection: read the file locally, draw it into the canvas area fit to box,
  parse EXIF, stay on `/`. Never navigate.
- `js/exif.js` wraps `exifr.parse(file, {gps: true, exif: true})` and returns the
  EXIF contract with nulls. It must not throw.
- `js/fields.js` builds the registry from the EXIF contract. SOURCE group: time,
  camera, exposure (aperture, shutter, ISO), bearing, altitude, coordinates.
  Missing fields are `available: false` with a reason such as "no GPS in this
  file" or "no timestamp".
- The sidebar renders SOURCE and STYLE from the registry. DERIVED rows appear in
  this phase as disabled rows reading "resolves in phase 3", so the finished
  panel shape is visible now.
- Toggling a row updates state and redraws a minimal placeholder plate on the
  canvas (mono text, amber rule, bottom left), so the toggle behaviour is real
  before the real HUD exists.
- Keep the existing Share action working: post the current image plus the current
  payload, show the link in a small popover. Deleting the vertical slice would
  break the rubric demo.
- Accessibility: switches are real `input type="checkbox"` with labels, focus
  rings visible, hit targets at least 40px.

Done when: dropping a phone JPEG shows the photo in the canvas with the sidebar
populated from its EXIF, a screenshot with no GPS shows dimmed rows with
reasons, toggling a row changes the canvas immediately, the page never
navigates, `npm run smoke` still passes, and the console is clean.

### Phase 3: reconstruction (done)

- Four independent lookups in `js/reconstruct.js`. Each has a 15s timeout,
  try/catch that resolves to `null`, and a cache keyed by rounded coords plus
  hour, TTL 24h in `localStorage`.
- Results feed `js/fields.js`, which flips DERIVED rows from disabled to
  available with values.
- Provenance per field in the row title attribute and a small `i` popover: which
  API produced it.
- Weather code to text via `js/wmo.js`; golden hour from SunCalc.
- Peaks: bearing filter, distance sort, name and elevation only when present.

Done when all four fields populate for a Seoul photo and every field degrades
visibly when its source is down.

### Phase 4: map overlay (done)

- Leaflet in an overlay opened from the location row, never a permanent panel.
- Marker at the photo coordinates, draggable; dragging re-runs the reverse
  geocode and updates the place value.
- Photos without GPS open the overlay in picker state, click to place the pin.
- "Use my location" button using `navigator.geolocation`, to satisfy a literal
  reading of "location based" in the rubric.

Done when the pin can be corrected on a photo with no GPS and the place row
updates.

### Phase 5: HUD renderer (done)

- `js/hud.js` exports `renderHUD(ctx, image, fields, config)`, reading the field
  registry rather than a hardcoded list.
- Position lives in the config as normalised fractions, `x` and `y` between 0
  and 1, never pixels. The same config must land in the same relative place on a
  600px preview, a 3264px export and the share page.
- Three presets that change arrangement, not field selection: `plate` (bottom
  bar), `corner` (compact block, right aligned), `strip` (film-strip rule along
  the bottom edge). Each preset carries a default position and type scale.
  Switching preset keeps the enabled fields and then allows dragging.
- Drag the plate directly on the canvas with pointer events. Clamp it inside the
  frame, and snap within 24 screen pixels to eight anchors: four corners and
  four edge midpoints. Arrow keys nudge by 1 percent, Shift plus arrow by 5.
- STYLE group controls: preset, tone, accent, font scale, opacity, and a reset
  position action.
- Monospace numerals, one accent colour, a scrim behind text for legibility.
- Crisp text at any scale: render to a backing canvas of `naturalWidth * scale`,
  apply `ctx.scale()`, never upscale a low-res canvas.
- The default layout must not cover the subject: keep plates to the outer
  quarter of the frame until the user moves them.

Done when dragging updates the stored normalised position, the plate survives a
window resize and a preset switch in the same relative spot, arrow keys nudge it,
and `npm run smoke` still passes.

### Phase 5b: recent galleries and reopen (done)

The database already holds every saved gallery; the editor cannot see any of
them. This phase closes that loop.

- `GET /api/galleries?limit=20` returns the newest records first as
  `{ slug, createdAt, imagePath, place, preset }`. Clamp the limit between 1 and
  50, default 12. No pagination beyond that.
- The sidebar footer gains a `Recent` group: rows with a 40px thumbnail from the
  stored image path, the place name or `untitled`, and a relative time. Empty
  state reads `saved photos appear here`.
- Clicking a row reopens it in the editor: fetch the record, load the image from
  its stored path, rebuild the field registry from the stored context snapshot
  and the photo's own EXIF, restore `hudConfig` including x, y, preset, tone,
  accent, fontScale, opacity and the enabled field list, then repaint.
- Reopening must not trigger any network reconstruction. The snapshot is enough,
  and a reopened photo must render instantly with the network off.
- Refresh the list after every successful share so a new save appears at once.
- Opening a record does not overwrite it. Sharing again mints a new slug.

Done when two saved galleries appear in Recent, reopening the older one restores
the same HUD position and values as when it was saved, nothing is re-fetched from
the network on reopen, and `npm run smoke` still passes.

### Phase 6: export and sharing (done)

- `js/export.js` exports `renderToBlob(imageBitmap, fields, hudConfig, opts)`.
  It builds an offscreen canvas at the image's natural size (same 4096 cap as
  the editor), calls `renderHUD`, and resolves a Blob through `toBlob`. PNG by
  default, JPEG at 0.92 when asked.
- Export filename `then-n-there-<ISO timestamp>.<ext>`. The export must be
  pixel-identical to what the preview shows, at full resolution.
- Editor top bar gets an `Export` action next to `Share`. One click downloads a
  PNG at native size; a small menu offers JPEG.
- Share posts the current image, HUD config and context snapshot, then shows the
  URL with a copy button and an open link.
- Share page is read-only and rebuilds the same picture without the editor:
  fetch the record, load the stored image as a blob, parse its EXIF with exifr,
  build the field registry with `buildFields(exif, hudConfig, context)`, apply
  `hudConfig.fields` as the enabled set, then draw with `renderHUD` into a canvas
  at the image's natural size (4096 cap) and scale it down with CSS.
- Share page also gets a download button that reuses `js/export.js`, a
  "restored from EXIF and public data" footnote, and a link back to `/`.

Done when an exported PNG is exactly the image's pixel dimensions with crisp
HUD text, and a share link opened in a browser profile that never visited the app
renders the same HUD as the editor preview for that record.

### Phase 7: polish and demo (done, except the demo photo set, which must be the author's own originals)

- Loading states per lookup, a global progress indicator, error toasts.
- Keyboard accessible controls, focus rings, `prefers-reduced-motion`.
- Responsive down to 380px wide; the sidebar becomes a bottom sheet.
- Empty states for no photo, no GPS, no peaks found.
- Prepare `demo/` with 3 to 5 original phone photos that carry GPS, plus one
  stripped screenshot to show the fallback. Do not commit photos of other people
  without permission.

### Phase 8: report support (done)

- A `docs/rubric.md` mapping each implementation line (HTML+CSS, JavaScript,
  location based, Canvas, open API, server/client, database) to the exact file
  and function that implements it, with a screenshot filename per item.
- Level table for the report: L1 layout and drop zone, L2 EXIF intake and HUD
  canvas, L3 reconstruction from open APIs, L4 map and share link, L5
  persistence and the share service.

## 8. Definition of done

- `npm start` on a clean clone with an empty `data/` works, creating the DB.
- One photo goes from drop to exported PNG without touching the console.
- A share link opens in a fresh browser profile and renders identically.
- Killing the network after reconstruction leaves the HUD and export fully
  functional, because the snapshot is local.
- No API key, secret, or personal data in the repo; `git status` clean apart from
  intended files.
- README states the reference proposal and lists every addition, so the report's
  "Addition/modification" field has a source.

## 9. Delegation protocol (how to hand this to OpenCode)

Rules:

1. One phase per OpenCode session. Never let it run two phases in one prompt.
2. Use `opencode run '<prompt>' -m deepseek-personal/deepseek-v4-pro -f PLAN.md`
   from the repo root, non-interactive, then review the diff yourself.
3. Every prompt names the phase, the acceptance check, and the files it may
   touch. End with "run the phase's Done when check and report the result".
4. OpenCode commits after each phase with a conventional commit
   (`feat(hud): ...`). Review before the next phase starts.
5. If a phase fails its check twice, stop and report instead of letting it
   rewrite earlier phases.
6. Forbid in every prompt: new frameworks, bundlers, TypeScript, dependencies
   outside section 2, touching `data/` or `.gitignore`, and any visual change
   not described in section 6.

Prompt template:

```
Phase N of PLAN.md. Read sections 2, 4, 5, 6 and phase N.
Scope: only these files: <list>.
Do not add dependencies. Do not introduce a build step.
Done when: <the phase's Done when sentence>.
Run the check, then commit as: <type(scope): message>.
```
