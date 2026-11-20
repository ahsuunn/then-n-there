# Then & There

A photo inspector. Drop a phone photo and the app reads the EXIF anchors that
were never meant for humans (GPS, capture time, altitude, camera bearing,
exposure), reconstructs the context that was never in the file at all (the place,
the weather at that hour, the ground elevation, the named peaks in the direction
the camera faced, the position of the sun and moon), and draws all of it onto the
photo as a canvas HUD you can drag around and restyle. Export the result at full
resolution, or mint a share link that renders the same picture for anyone.

Web Programming 2026 final assignment, based on proposal #25 "Photo Map Tracker"
by 류수민, extended with a share service, named peaks, and the sky fields.

This document is written to be read next to the code. It explains the shape of
the system first, then walks each module, then lists the invariants that will
bite you if you change something carelessly. If you only read one section, read
"The three coordinate spaces".

---

## 1. Run it

Requires Node.js 20 or newer (built and tested on Node 22).

```
npm install
npm start          # http://127.0.0.1:3000
npm run dev        # same, with node --watch
npm run smoke      # end-to-end check against a throwaway data folder
```

First boot creates `data/`: `data/app.db` (SQLite, WAL) and `data/uploads/`. The
folder is gitignored. Delete it to start from an empty database. The server
honours `TNT_DATA_DIR=<path>` if you want the data somewhere else, which is how
the smoke suite keeps its 1x1 test PNGs out of your real galleries.

Sharing also writes a 96px JPEG thumbnail per gallery under `data/thumbs/`, which
is what the Recent list loads instead of the full photo.

No API keys, no accounts, no build step.

---

## 2. Architecture

```
                    ┌─────────────────────────── browser ───────────────────────────┐
                    │                                                               │
  editor  /        │  index.html → editor.js  ──► state.js                          │
                    │      │              │                                         │
                    │      │              ├─► exif.js ──────► exifr (CDN)           │
                    │      │              ├─► fields.js ────► field registry        │
                    │      │              ├─► reconstruct.js ─┐                     │
                    │      │              ├─► hud.js ◄────────┘ renderer            │
                    │      │              └─► export.js (offscreen canvas → Blob)   │
                    │                                                               │
  share   /s/:slug  │  share.html → share.js ──► fields.js + hud.js + export.js     │
                    │                                                               │
                    └───────────────┬───────────────────────────────┬───────────────┘
                                    │ HTTP                          │ HTTPS
                    ┌───────────────▼───────────────┐   ┌───────────▼───────────────┐
                    │ Express (server/index.js)     │   │ BigDataCloud reverse geo   │
                    │  db.js  → SQLite              │   │ Open-Meteo archive (weather)│
                    │  uploads.js → magic bytes     │   │ Open-Meteo elevation        │
                    │  slug.js → 8-char base62      │   │ Overpass (via /api/peaks)  │
                    │  peaks.js → mirrors + cache   │   │ SunCalc (local, no call)   │
                    └───────────────┬───────────────┘   └───────────────────────────┘
                                    │
                            data/app.db, data/uploads/
```

Two independent clients share one renderer and one field registry. That is the
central design rule: the editor and the share page are different surfaces over
the same `hud.js` and `fields.js`, so a saved record cannot drift from what the
author saw.

---

## 3. Four flows worth tracing

### 3.1 Dropping a photo

`editor.js` (section "file intake") receives a `File`, calls `readExif(file)`
from `exif.js`, decodes the bitmap with `createImageBitmap` (which applies the
EXIF orientation, so a portrait phone photo becomes portrait pixels), builds the
registry with `buildFields(exif, hud, null)`, paints once with `renderHUD`, then
starts `reconstructContext(exif, {onResult})` from `reconstruct.js`. Each lookup
that lands triggers a partial repaint and flips one sidebar row from `pending` to
`available`. The page never navigates: this is a single document that swaps its
subject.

### 3.2 Dragging the plate

`editor.js` (section "plate drag and keyboard nudge") converts the pointer to
frame pixels, asks `layoutHUD()` where the plate currently is, and only starts a
drag if the pointer is inside that rectangle plus a small grace. During the
gesture it stores the offset between pointer and plate corner, so the plate never
jumps. On release the position is written back as **fractions of the frame**
(`state.hud.x`, `state.hud.y`), never pixels.

### 3.3 Exporting

`export.js` `renderToBlob(imageBitmap, fields, hudConfig, opts)` creates an
offscreen canvas at `exportSize(image)` (natural size, capped at 4096 on the long
edge), calls the same `renderHUD`, and resolves `canvas.toBlob`. Because the
backing store is the photo, output pixels and preview pixels come from one
coordinate space; the preview is only the same drawing displayed smaller.

### 3.4 Sharing

`editor.js` (section "sharing") posts the current image plus a payload of
`{hudConfig, context}` to `POST /api/galleries`. The server writes the file,
inserts a row, returns an 8-character slug, and the editor shows the URL. Opening
`/s/:slug` loads `share.html`, which fetches the record, re-reads EXIF from the
stored image (same origin, no CORS), rebuilds the registry with
`buildFields(exif, hudConfig, context)`, applies `hudConfig.fields` as the enabled
set, and paints with `renderHUD`. **No reconstruction request is made**: the
context snapshot is already in the row, which is also why a share page works
offline and instantly.

---

## 4. The five shapes you need in your head

**EXIF contract** (`exif.js`): every field optional.

```
{ latitude, longitude, capturedAt, offset, altitude, bearing,
  focalLength, fNumber, exposureTime, iso, make, model, width, height }
```

**Context snapshot** (`reconstruct.js`): what gets stored with a gallery.

```
{ place: {name, admin, country} | null, weather: {tempC, code, wind, cloud} | null,
  elevation: number | null, peaks: [{name, distanceKm, bearingDeg, elevation}],
  sun: {sunrise, sunset, solarAzimuth, isGoldenHour}, moon: {phase, illumination} }
```

**Field registry** (`fields.js`): one entry per displayable field, and the only
thing the sidebar and the renderer read.

```
{ id, group: 'source' | 'derived' | 'style', label, value, format,
  available, reason, enabled, source }
```

Rule: a field that cannot be resolved is rendered **disabled with its reason**,
never hidden. Reasons are specific ("no direction recorded", "no timestamp",
"Overpass unavailable") because the degradation is part of the demo.

**HUD config** (`state.js` → row → share page):

```
{ preset, x, y, tone, accent, fontScale, opacity, align, moved, fields: [ids] }
```

`x` and `y` are the plate centre as fractions of the frame. That single decision
is what makes a dragged plate survive a window resize, an export, and the share
page.

**Gallery row** (`server/db.js`): `slug, created_at, image_path, image_width,
image_height, hud_config, context`. The last two are JSON text.

---

## 5. Server, file by file

| File | Lines | Responsibility |
|---|---|---|
| `server/index.js` | 165 | Express app, static hosting, the seven routes, error mapping |
| `server/db.js` | 120 | Opens SQLite, creates `data/`, schema, queries |
| `server/uploads.js` | 74 | Multer memory storage, 15 MB cap, magic-byte sniffing, pixel dimensions |
| `server/slug.js` | 14 | 8-character base62 slug from `crypto.randomBytes` |
| `server/peaks.js` | 65 | Overpass proxy: mirror rotation, retries, 24h in-memory cache |

Routes:

```
POST /api/galleries        multipart image + payload JSON → 201 record
GET  /api/galleries        ?limit=1..50 (default 12) → newest first, trimmed
GET  /api/galleries/:slug  full record, 404 JSON when unknown
GET  /s/:slug              serves share.html (the client fetches the record)
DELETE /api/galleries/:slug  removes the row and its image, 204
GET  /api/peaks            ?lat&lon&radius → Overpass JSON, validated, cached
GET  /uploads/*, /*        static files
```

Why `uploads.js` sniffs magic bytes instead of trusting the extension: a file
named `.png` that is really text must be rejected with 400, and the smoke test
asserts exactly that.

Why `peaks.js` exists at all: the browser cannot call Overpass reliably. Only one
public instance sends CORS headers, and every instance answers 502 when its
workers are full. The proxy rotates three mirrors, retries with backoff, times
out at 5 seconds per attempt, and caches per rounded coordinate pair for a day.

---

## 6. Client, file by file

| File | Lines | Responsibility |
|---|---|---|
| `state.js` | 39 | One store: `image`, `exif`, `fields`, `hud`, plus `set()`/`subscribe()` |
| `exif.js` | 97 | `readExif(file)` → the EXIF contract, nulls instead of throws |
| `fields.js` | 301 | `buildFields()` → registry; `enabledFieldIds()`; provenance text |
| `reconstruct.js` | 478 | Four lookups, per-field timeouts, `localStorage` cache, sky maths |
| `hud.js` | 572 | `layoutHUD()`, `renderHUD()`, `snapBox()`, the three presets |
| `map.js` | 300 | Leaflet overlay, draggable pin, picker state, geolocation |
| `export.js` | 130 | `renderToBlob()`, `exportSize()`, `exportName()`, download helper |
| `editor.js` | 1621 | Wiring: intake, sidebar, canvas, drag, map, recent, export, share |
| `share.js` | 212 | Read-only viewer: fetch record, rebuild fields, paint, download |
| `ui.js` | 98 | `toast()`, `setBusy()` |
| `wmo.js` | 40 | WMO weather code → short text |

`editor.js` is the long one; its section comments are the map:

```
initial render · file intake · reconstruction · location map · sidebar ·
style group · canvas · plate drag and keyboard nudge · recent galleries ·
export · sharing · canvas keeps up with the stage and the font load
```

Read it in that order and it is a sequence, not a pile.

---

## 7. The three coordinate spaces

Getting this wrong is the one bug that ruins the whole product, so it is worth
being explicit.

1. **Photo pixels.** `imageBitmap.width/height`. Always the source of truth.
2. **Frame pixels.** The canvas backing store: photo pixels capped at 4096 on the
   long edge (`export.js MAX_EXPORT_EDGE`). All HUD geometry, type sizes and
   hit tests happen here.
3. **CSS pixels.** What the user points at. The canvas is displayed with
   `max-width/max-height` and `width: auto`, so the ratio
   `canvas.width / getBoundingClientRect().width` converts a click into frame
   pixels.

Because the plate position is stored as a fraction of the frame, and because the
renderer always draws in frame pixels, the preview, the export and the share page
agree without any per-surface special cases. The CSS never scales the HUD.

The auto-fit loop in `layoutHUD()` is the safety valve: it measures the plate at
the base unit (2.6% of frame width, capped by height), and while the plate exceeds
the preset's `maxWidth`/`maxHeight` it shrinks the unit by the fit factor, up to
eight attempts, with a 6px floor. That is why enabling ten fields makes the type
smaller instead of making the plate overflow, and why the default field set is
deliberately short.

---

## 8. Presets are layout functions, not skins

`hud.js` `PRESETS` describes arrangement:

```
plate   rows,    maxWidth 0.90, columns by row count, default at 50% / 90%
corner  stack,   maxWidth 0.66, two columns past six rows,  default at 84% / 18%
strip   inline,  maxWidth 0.94, single line of pairs,       default at 50% / 94%
```

Each preset carries `padX`, `padY`, gaps, line height and a rule position, all in
multiples of the type unit, so a preset scales with the photo rather than with
the viewport. Switching preset applies that preset's default anchor and type
scale and keeps the enabled field list, but only while the plate has not been
dragged (`moved` is false); once the user has positioned it, the normalised centre
survives preset changes and only the Reset action clears the flag.

`snapBox(box, frameW, frameH, threshold)` is what makes dragging feel deliberate:
eight anchors (four corners, four edge midpoints) within `24 * scale` pixels,
where `scale` converts screen pixels to frame pixels so the snap feels the same
at every window size.

---

## 9. Degradation is a feature

Every derived field can fail on its own, and the UI is built to show that:

- Each lookup has its own 15-second budget (peaks 25 seconds, because it waits on
  the proxy), its own `try/catch` resolving to `null`, and no shared failure.
- Successful results are cached in `localStorage` under
  `tnt:reconstruct:v1:<kind>:<lat3>,<lon3>:<hour>` for 24 hours, so re-dropping
  the same photo costs no requests.
- `fields.js` turns `null` into a specific disabled row with a reason.
- Reopening a saved gallery makes **zero** reconstruction requests, because the
  context snapshot travels with the row.

The demo consequence: with the network off after intake, the HUD, the drag, the
export and every saved gallery still work.

---

## 10. Decisions and their trade-offs

**Vanilla ES modules, no framework, no build step.** The course grades HTML, CSS
and JavaScript; a framework would add tooling and hide exactly the code being
graded. Cost: no component model, so `editor.js` carries explicit DOM wiring and
its length is the price.

**One renderer for two surfaces.** The share page re-renders from the stored
config instead of storing a rendered PNG. Smaller rows, and the HUD stays
editable later. Cost: `hud.js` must stay pure and dependency-free, because both
clients load it directly.

**Position in fractions, not pixels.** Survives resize, export scale and the
share page. Cost: everything that reads position needs frame dimensions.

**Overpass behind a server proxy.** The alternative was one unreachable API and a
field that fails at demo time. Cost: the share page never needs the proxy, but the
editor does, so the server is required for the full experience.

**SQLite file, no ORM, no auth.** A single-user course project. `data/` is the
whole state, and deleting it is a valid reset. Cost: anyone with the port can
save a gallery, which is acceptable here and would not be in a real service.

---

## 11. A guided first read

1. `server/db.js` — the schema is the whole persistence story; read it first.
2. `server/index.js` — seven routes, each short. Note the validation order:
   file present, magic bytes, payload JSON, then write.
3. `public/js/state.js` — 39 lines, and everything else hangs off this shape.
4. `public/js/exif.js` — how a `File` becomes the EXIF contract, including
   orientation and null handling.
5. `public/js/fields.js` — the registry. This is the contract between data and
   UI; `DEFAULT_ON` explains the default plate.
6. `public/js/reconstruct.js` — read `reconstructContext` then `cached` then one
   lookup (weather is the clearest). Note what is not fetched: sun and moon.
7. `public/js/hud.js` — `layoutHUD` (measure, auto-fit, position), then
   `renderHUD`, then `snapBox`. This is the most interesting arithmetic in the
   repo.
8. `public/js/export.js` — 130 lines proving that export is just another draw.
9. `public/js/editor.js` — read by section, using the markers above; skip the
   first pass over the sidebar builders if you only want the flow.
10. `public/js/share.js` — the same renderer with no editor around it.
11. `scripts/smoke.js` — what "it works" means in this repo, and the reason the
    data folder is overridable.

---

## 12. Rubric mapping

| Implementation line | Where it lives |
|---|---|
| HTML and CSS | `public/index.html`, `public/share.html`, `public/css/tokens.css`, `editor.css`, `primitives.css`, `share.css` |
| JavaScript | all of `public/js/`, ES modules, no framework |
| Location based | `exif.js` (GPS contract), `map.js` (Leaflet overlay, pin drag, picker, geolocation), `reconstruct.js` (reverse geocode, elevation) |
| Canvas | `hud.js` (layout and draw), `export.js` (offscreen render, `toBlob`) |
| Open API | `reconstruct.js`: BigDataCloud, Open-Meteo archive, Open-Meteo elevation, Overpass via `/api/peaks` |
| Server / client | `server/index.js` (API), `share.js` (client of that API), upload and share flow |
| Database | `server/db.js`, schema in section 5, `data/app.db` |
| Web Storage | `reconstruct.js` cache: `tnt:reconstruct:v1:<kind>:<lat3>,<lon3>:<hour>`, 24h |

Suggested level table for the report: L1 editor layout and drop zone, L2 EXIF
intake and HUD canvas, L3 reconstruction from four open APIs, L4 movable HUD,
presets and share link, L5 persistence, export at native size, reopen from
history.

---

## 13. What is not built

- Editing a saved gallery. Rows are immutable apart from delete, and switching a
  record never overwrites it: sharing again mints a new slug.
- Pagination beyond 50 recent rows, and any authentication.
- A demo photo set; bring your own originals, since messengers and social apps
  strip EXIF and those photos will show the fallback states.

## 14. Reference

Proposal #25 "Photo Map Tracker" by 류수민. Additions over the proposal: the share
service with per-export URLs, named peaks, the sun and moon fields, the movable
HUD with presets, and native-resolution export. Build history and phase
boundaries live in `PLAN.md`; agent constraints live in `AGENTS.md`.
