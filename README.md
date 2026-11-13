# Then & There

Photo map tracker and share service. Web Programming 2026 final assignment,
based on proposal #25 "Photo Map Tracker" by 류수민, extended with a share
service.

Upload a photo. The app reads the EXIF anchors (GPS, capture time, altitude,
camera bearing, exposure), reconstructs the context that was never in the file
(place, weather at that hour, ground elevation, named peaks in the facing
direction, sun and moon position), composites that context onto the photo as a
canvas HUD, and exports the result. Every saved export gets a share URL.

## Run

Requirements: Node.js 20 or newer (developed on Node 22).

```
npm install
npm start
```

Then open http://127.0.0.1:3000 in a browser. `npm run dev` runs the server
with `node --watch` so it restarts on change. `npm run smoke` starts the
server, uploads a test image, and checks the API and share view, then stops.

The server creates a `data/` directory on first boot: `data/app.db` (SQLite)
and `data/uploads/` (uploaded photos). That folder is gitignored; delete it to
reset the database.

## Data sources

All data sources are keyless and public; the app stores no API keys.

- Reverse geocode: BigDataCloud reverse geocode client
- Historical weather: Open-Meteo archive API
- Ground elevation: Open-Meteo elevation API
- Named peaks: Overpass API (OpenStreetMap), called through `GET /api/peaks`
  on this server rather than from the browser. Only one public Overpass
  instance sends CORS headers, and all of them answer 502 when their workers
  are busy, so the server rotates three mirrors, retries with backoff, and
  caches each answer for a day.
- Sun and moon: SunCalc, computed locally
- Map tiles: OpenStreetMap via Leaflet

See PLAN.md section 3 for the exact endpoints and notes.

## Rubric mapping

The final report maps each implementation line to files and functions; that
mapping lives in `docs/rubric.md` (added in a later phase). Suggested level
table: L1 layout and drop zone, L2 EXIF intake and HUD canvas, L3
reconstruction from open APIs, L4 map and share link, L5 persistence and the
share service.

## Reference

Proposal #25 "Photo Map Tracker" by 류수민. Additions made over the proposal:
a share service with per-export URLs, plus the named-peaks, sun and moon
reconstruction fields. See PLAN.md for the full build plan.
