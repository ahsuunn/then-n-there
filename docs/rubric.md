# Rubric evidence

Line by line, where each requirement of the assignment lives and how to prove it
in the report. Cite functions, not line numbers: the numbers drift, the names do
not.

The report template lists seven implementation items and the proposal table
scores three levels. Both are covered here.

---

## 1. Implementation items

### HTML and CSS

- `public/index.html`: `<header>` top bar, `<aside>` sidebar with three
  `<section>` groups, `<main>` stage, real `<input type="checkbox">` switches
  inside labels, `aria-labelledby` per group, `aria-describedby` on the map
  dialog.
- `public/share.html`: separate document, no editor controls, `<a>` back to `/`.
- `public/css/tokens.css`: the eight custom properties, reset, base type, motion
  preference. Every other file reads the tokens, no raw hex outside this file.
- `public/css/editor.css`, `primitives.css`, `share.css`: layout, shared
  primitives, share surface. Four files, one responsibility each.
- Responsive: single breakpoint at 899px turning the sidebar into a bottom sheet.

Evidence: screenshot of the editor with a photo loaded, one of the share page,
one at 380px wide.

### JavaScript

- All of `public/js/`, ES modules loaded by the browser with no build step and no
  framework: `state.js` (39 lines), `exif.js`, `fields.js`, `reconstruct.js`,
  `hud.js`, `map.js`, `export.js`, `editor.js`, `share.js`, `ui.js`, `wmo.js`.
- The two clients share `hud.js` and `fields.js`; there is no second renderer.

Evidence: the file list, plus one paragraph on why the renderer is shared.

### Location based

- `exif.js readExif()` returns `latitude`/`longitude` from the file's GPS IFD.
- `reconstruct.js` turns coordinates into a place name (BigDataCloud) and an
  elevation (Open-Meteo).
- `map.js openMapOverlay()` puts the point on a Leaflet map with OSM tiles; the
  marker is draggable and a click places it for photos with no GPS.
- `editor.js applyMapPoint()` writes the corrected point back and repaints, and
  the corrected point travels in the share snapshot as `context.coords`.
- `navigator.geolocation` via the map's "Use my location" action.

Evidence: two screenshots, one photo with GPS and one without, both with the map
open; a third showing the coordinates row changed after a drag.

### Canvas

- `hud.js layoutHUD()` measures and lays out the plate in image coordinates;
  `renderHUD()` draws it; `snapBox()` handles drag snapping; `PRESETS` holds the
  three arrangements.
- The editor canvas backing store is the photo itself (capped at 4096), so the
  drawing is resolution independent and the preview is only a scaled display.
- `export.js renderToBlob()` draws the same thing into an offscreen canvas and
  resolves a Blob through `toBlob`, at the photo's full size.

Evidence: an exported PNG at 2448x3264 beside the preview, plus the drag
sequence.

### Open API

Four keyless services, all called from `reconstruct.js`:

| API | Used for | Call |
|---|---|---|
| BigDataCloud reverse geocode | place name, district, country | `GET api.bigdatacloud.net/data/reverse-geocode-client` |
| Open-Meteo archive | weather at the capture hour | `GET archive-api.open-meteo.com/v1/archive`, `timezone=auto` |
| Open-Meteo elevation | ground elevation | `GET api.open-meteo.com/v1/elevation` |
| Overpass (OSM) | named peaks, bearing filtered | `GET /api/peaks` → `server/peaks.js` |

Sun and moon come from SunCalc computed locally, which is deliberate: not
everything should be a network call, and the report can say why.

Evidence: a screenshot of the Derived group filled, one with a field degraded to
its reason, and the JSON of one request.

### Server / client

- `server/index.js`: `POST /api/galleries` (multipart, magic-byte validation),
  `GET /api/galleries?limit=`, `GET /api/galleries/:slug`, `GET /s/:slug`,
  `GET /api/peaks`.
- `server/db.js`, `server/uploads.js`, `server/slug.js`, `server/peaks.js` split
  by responsibility.
- The client side of that boundary: `editor.js` posting the image plus
  `{hudConfig, context}`, `share.js` fetching a record and rebuilding the picture
  with no reconstruction calls.

Evidence: a share link opened in a fresh browser profile, plus the network panel
showing one POST and one GET.

### Database

- SQLite via `better-sqlite3`, opened in `server/db.js`.
- Schema: `galleries(slug TEXT PRIMARY KEY, created_at, image_path,
  image_width, image_height, hud_config TEXT, context TEXT, thumb_path TEXT,
  fingerprint TEXT)`, WAL mode. Columns added after the first release are
  migrated in place by a `PRAGMA table_info` guard, so an upgrade never drops
  rows. `fingerprint` is indexed and holds the sha256 of a gallery's content, so
  identical shares resolve to one record.
- Queries: `insertGallery`, `getGallery`, `listGalleries`, `slugExists`,
  `deleteGallery`, `findGalleryByFingerprint`.
- Data lives in `data/app.db` plus `data/uploads/`; both gitignored, and
  `TNT_DATA_DIR` moves them.

Evidence: a `sqlite3 data/app.db 'select * from galleries'` output next to the
Recent list in the editor.

### Web Storage

- `reconstruct.js`: each lookup is cached under
  `tnt:reconstruct:v1:<kind>:<lat3>,<lon3>:<hour>` for 24 hours, so re-dropping a
  photo costs no requests.

Evidence: `Object.keys(localStorage)` in the console after two drops of the same
file.

---

## 2. Suggested level table

| Level | What it covers | Where |
|---|---|---|
| L1 | Editor layout, drop zone, file picker, empty state | `index.html`, `editor.css` |
| L2 | EXIF intake, field registry, HUD canvas with three presets | `exif.js`, `fields.js`, `hud.js` |
| L3 | Reconstruction from four open APIs with per-field degradation | `reconstruct.js`, `wmo.js` |
| L4 | Movable HUD, map pin correction, share link, reopen from history | `hud.js` drag, `map.js`, `share.js`, `editor.js` recent |
| L5 | Persistence, native-resolution export, share service | `server/`, `export.js`, `share.js` |

## 3. What to show in the demo, in order

1. Drop a phone photo with GPS. Point at the source rows filling from EXIF.
2. Let the derived rows resolve, one by one, and say which API each comes from
   (the small `i` on each row).
3. Drag the plate, switch preset, nudge with the arrow keys.
4. Open the map, drag the pin, close it, and show the coordinates row and the
   HUD both following.
5. Export the PNG, open it, zoom to 100 percent.
6. Share, then open the link in a private window.
7. Drop a stripped screenshot to show the degradation path rather than hiding it.
8. Open a saved gallery from Recent to show persistence without a network call.

## 4. Claims to avoid

- Do not claim the map is required for a verdict, or that the app works offline
  before a photo is loaded: the open APIs need the network on first intake.
- Do not claim the share page is a stored render. It is a re-render from the
  stored config, and that is a better story.
- Do not claim Overpass is reliable. The proxy exists because it is not; say so,
  and show the cached path.

---

## 5. Screenshot checklist

Name the files this way so the report can reference them unambiguously.

| File | What it shows |
|---|---|
| `01-editor-exif.png` | Editor with a phone photo loaded, source rows filled from EXIF |
| `02-derived-filled.png` | The Derived group after reconstruction, with provenance popovers |
| `03-degraded.png` | A stripped screenshot: dimmed rows with reasons |
| `04-hud-presets.png` | The same photo in plate, corner and strip |
| `05-hud-drag.png` | The plate moved, position readout visible |
| `06-map-gps.png` | Map overlay opened from the coordinates row |
| `07-map-picker.png` | A photo without GPS, pin placed by clicking the map |
| `08-export.png` | The exported PNG at 100 percent with crisp text |
| `09-share.png` | The share link open in a private window |
| `10-recent.png` | Recent list with a reopened gallery |
| `11-mobile-380.png` | 380px wide, bottom sheet |
| `12-db.png` | `sqlite3 data/app.db 'select slug, created_at from galleries'` output |
