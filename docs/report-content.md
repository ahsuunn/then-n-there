# Assignment Report content (paste-ready)

Copy each block into the matching section of the template. Figures refer to the
screenshot checklist at the end; replace `[Figure N]` with the actual image once
you have taken it.

---

## Changes since the last export

Five edits, each in place below. Paste them in this order; the section names are
the ones in the exported PDF.

| # | Where | What changed |
|---|---|---|
| 1 | 2.5 Overlay layout | the preset paragraph now names the base corner radius and the two plate preferences |
| 2 | 3 Results | one new bullet about the radius multiplier and the typeface switch, with measured widths |
| 3 | 3.1 Limitation | the share sentence is corrected, and three limits are added: Leaflet still loads from a CDN, a radius or typeface change counts as new content, and an old gallery mints one duplicate record |
| 4 | Figures | caption 1 mentions the Style controls, caption 2 now quotes the resolved peak instead of a failure, caption 4 says which radius and face the presets are drawn in, and 7 to 9 are renumbered to match the PDF (share, mobile, database) |
| 5 | Figures 1 to 8 | re-shot against the current build in `docs/screenshots/`; the SQLite figure stays yours |

Four earlier corrections are also still waiting if the PDF was exported before
them: the export dimensions, the reconstructed values and the list payload
number in section 3, and the content-addressing paragraph in 2.6.

---

## Summary Page

**Title**

Then & There: reconstructing a photo's missing context from EXIF and open data

**Number of used reference**

1

**Addition/modification to reference**

Addition: a share service with per-gallery URLs and a read-only share page, a
movable HUD with three presets, a map overlay for correcting the photo location,
named peaks, sun and moon fields, native-resolution export, and a recent-gallery
list with reopen and delete.

Modification: the reference proposed a browser-only tool. This implementation
adds a server with SQLite persistence, moves the peaks lookup behind a server
proxy because the public data source does not permit browser access reliably,
and stores the resolved context with each saved gallery so a share page renders
without querying any network.

**Implementation**

HTML+CSS, JavaScript, location based, Canvas, database, open API, Server/Client.
All seven are implemented.

**Specify your background knowledge in Web programming**

Experienced (taken course before)

---

## 1. Program description

Then & There is a web application for photographs that already contain
information nobody sees. A phone photo carries GPS coordinates, a capture
timestamp, the altitude, the direction the camera faced, and the exposure
settings, all stored as EXIF metadata inside the file. Almost none of that ever
reaches a viewer, and none of it describes the context a person actually
remembers: what the weather was, how high the ground was, which mountain stood
in the direction of the shot, whether the light was already gold.

The application closes that gap. A user drops a photo into the editor, the
application reads its EXIF metadata, and then resolves the missing context from
four open data sources: the place name from a reverse geocoding service, the
weather at that hour from a historical weather archive, the ground elevation from
an elevation service, and the named mountain peaks within fifteen kilometres,
ranked by distance. Sun and moon positions are computed locally from the
coordinates and timestamp. The resolved values are composed onto the photograph
as an on-image overlay resembling a camera viewfinder readout, which the user can
move, restyle, and export at the photograph's full resolution.

The interface has three surfaces. The editor is a two-panel layout: a sidebar
listing every available field grouped into source data, reconstructed data, and
style, and a canvas area showing the photograph with the overlay. The share view
at `/s/<slug>` is a read-only page that renders one saved gallery exactly as its
author composed it, with a download button. The recent list inside the editor
sidebar shows previously saved galleries and reopens them for further work.

Every field can fail on its own. A photo without GPS still shows its timestamp
and camera, and the location row explains that the file contains no location
instead of disappearing. A photo whose EXIF has been stripped by a messaging
application still loads, with the affected rows dimmed and the reason stated.
This is deliberate: the interesting part of the product is the boundary between
what a file knows and what has to be reconstructed.

The application is implemented in plain HTML, CSS and JavaScript as ES modules,
with no framework and no build step, served by a Node.js Express server that also
stores galleries in SQLite and proxies one data source that cannot be reached
from a browser. All data sources are public and require no API key.

---

## 2. Approaches to solve problem

### 2.1 Architecture

The system separates three responsibilities. The browser owns parsing, layout and
rendering, because those are the parts that must respond without a round trip.
The server owns persistence, file storage and the one data source that needs a
proxy, because those are the parts that must survive a page reload. The database
stores one row per saved gallery, including the photograph's metadata snapshot,
so the system never has to re-derive what it already resolved.

Two clients share one renderer. The editor and the share page both import the
same HUD module and the same field registry, so a saved gallery cannot drift from
what its author saw. This was the single most important structural decision: a
second renderer for the share page would have been easier to write and would have
produced two different products within a week.

### 2.2 Reading the photograph

The EXIF parser returns a fixed contract in which every field may be null, and no
parse error escapes to the interface. Orientation is applied by decoding the file
with `createImageBitmap` rather than by rotating afterwards, so a portrait phone
photo becomes portrait pixels and the overlay is drawn in the same coordinate
system the export will use.

Because every field is optional in practice, each one carries its own reason when
it is missing: "no timestamp", "no camera info", "no direction recorded", "no GPS
in this file". The interface renders unavailable fields as dimmed rows with the
reason in place of the value, never as absent rows. A user therefore learns what
the file does and does not contain, which is the point of the application.

### 2.3 Reconstructing the context

The four lookups are independent by design. Each has its own fifteen second
budget, its own failure handling that resolves to null, and its own cache entry.
A failure in one cannot delay or cancel the others, and the interface updates
field by field as results arrive rather than showing a single global spinner.

Historical weather is the subtlest of the four. The archive API returns hourly
data in the local time zone of the coordinates when asked, so the lookup takes
the date from the capture timestamp, requests that single day, and selects the
hour matching the capture time. Without that alignment the reported weather would
describe the wrong part of the day.

The peaks lookup required a structural decision. The public Overpass instances do
not send CORS headers consistently, and when their worker pools are saturated they
answer with server errors. A browser-side request therefore fails unpredictably,
which is unacceptable for a value that appears in the interface. The lookup was
moved behind a server route that rotates three mirrors, retries with backoff,
validates and clamps the requested radius, and caches each answer for a day. The
row degrades to a specific message when every mirror is busy, and the cached path
makes repeat views instant.

### 2.4 One field registry

Both the sidebar and the overlay read a single registry that is rebuilt from the
photograph and its context. Each entry carries an identifier, a group, a formatted
value, availability and a reason. The overlay never hardcodes a list of fields and
neither does the sidebar, which is what allows the enabled set to be stored with a
gallery and reproduced exactly on the share page.

The default set is deliberately small: capture time, place, weather and
coordinates. The overlay's type size is derived from the frame width and then
reduced by an automatic fit loop until the plate fits its maximum width and
height, so enabling more fields shrinks the type rather than overflowing the
photograph. A short default keeps the first result readable.

### 2.5 Overlay layout and coordinate spaces

The overlay is drawn directly into a canvas whose backing store is the photograph
itself, capped at 4096 pixels on the long edge. Three coordinate spaces exist and
mixing them is the main source of bugs: photo pixels, frame pixels (the backing
store), and CSS pixels (what the pointer uses). All layout arithmetic happens in
frame pixels, and a single conversion uses the ratio between the backing store
width and the element's displayed width.

The plate's position is stored as fractions of the frame, never as pixels. That
one decision makes a dragged plate land in the same relative place after a window
resize, at export resolution, and on the share page. Dragging uses pointer events
with the offset between the pointer and the plate corner captured at the start of
the gesture, so the plate never jumps; positions snap to eight anchors within a
screen-pixel threshold, and arrow keys nudge by one percent, or five with Shift.

Three presets change arrangement rather than content: a bottom plate, a compact
corner block, and a single-line strip. Each carries its own default position,
type scale and base corner radius, and switching preset preserves the enabled
field list. Two plate properties are user preferences rather than preset
properties: a radius multiplier from 0 to 1.5 applied over the preset's base, and
a choice between the sans and mono faces. Both survive a preset switch, are
stored with the gallery, and are honoured by the share page because it hands the
stored config to the same renderer.

### 2.6 Export and share parity

Exporting renders the same drawing into an offscreen canvas at the photograph's
own size and encodes it, so the exported file is the same pixels as the preview
rather than a screenshot of it. Sharing stores the photograph, the overlay
configuration and the resolved context, and returns a short slug. The share page
reloads the stored photograph, re-reads its EXIF, rebuilds the field registry from
the stored snapshot, and draws with the same renderer. It makes no reconstruction
requests at all, which is why a share link opens instantly and why reopening a
saved gallery works with the network disabled.

A gallery is identified by its content. The editor hashes the photograph's bytes
together with a canonical form of the overlay configuration, and the server
returns the existing record when that fingerprint is already known. Sharing the
same photo twice therefore yields one link, while changing a field, dragging the
plate or correcting the pin produces a different fingerprint and a new record. A
link that has been sent is never altered later, because nothing is overwritten.

### 2.7 Degradation as a designed behaviour

Every reconstructed value can be absent, so absence is treated as a first-class
state rather than an error. Values are cached per rounded coordinate pair and hour
for a day, failures resolve to null, and the registry turns null into a specific
reason. The practical consequence is that the editor, the overlay, the
export, the map correction and every saved gallery keep working offline; only a
first-time reconstruction needs the network.

### 2.8 Verification

The project is checked by an end-to-end script that starts the server against a
throwaway data directory, uploads a test image, exercises the API and the share
route, and asserts the rejection paths. Running that suite against the real data
directory previously polluted the recent list with test records, which is why the
server now accepts a data directory override and the suite uses a temporary one.

Behaviour that a request-level test cannot see was verified in a real browser:
that the exported pixels match the preview by hashing both canvases, that the
split of the stylesheet left every computed style unchanged, that each commit in
the history still boots by checking out earlier commits in isolated worktrees,
and that tabbing reaches every control with a visible focus ring.

---

## 3. Results

The application works end to end. A phone photograph dropped into the editor
shows its source fields immediately and its reconstructed fields within a few
seconds, and the overlay can be dragged, restyled, exported and shared.

Measured results from the finished build:

- An exported PNG of the 4080 by 3060 sample photograph is exactly 4080 by
  3060, and its pixels are identical to the editor preview for the same record,
  verified by hashing both canvases.
- The share page renders the same overlay as the editor from the stored snapshot,
  with no network reconstruction. With both local and session storage emptied,
  the link still renders the identical canvas, so the page depends on the server
  record and nothing local.
- Reconstructed values for the sample photograph, taken at Donggung
  Palace and Wolji Pond in Gyeongju on 20 November 2026 at 21:11, resolved to the
  place name, 1.1 degrees Celsius with a clear sky, a ground elevation of 53
  metres, night with a solar azimuth of 280 degrees, and a waxing gibbous moon at
  80 percent illumination.
- The sample photograph carries a GPS block whose values are all NaN,
  so the location was set once with the map overlay and stored with the gallery;
  every location-derived field follows from that pin.
- The recent gallery list serves 96 by 96 pixel thumbnails of about 3 kilobytes
  each, and each list row costs roughly 145 bytes of JSON because it carries a
  path rather than an image, so a full list stays a few kilobytes regardless of
  how large the photographs are.
- Corner radius is a multiplier over each preset's own radius, so 0 draws a
  square plate and 1.5 a very round one, and switching typeface re-measures the
  plate: 563 pixels wide in the mono face against 524 in the sans face, recentred
  on the same point. Both values travel in the stored config, and a record saved
  as a square sans plate renders the same way when its share link is opened.
- Every control in the editor is reachable by keyboard with a visible focus ring,
  including the recent rows and the map dialog, and Escape closes the export
  menu, the share popover and the map overlay while returning focus to the
  control that opened it.
- At 380 pixels wide the layout has no horizontal scroll, the sidebar becomes a
  bottom sheet, and the canvas keeps the photograph's aspect ratio.
- The end-to-end suite passes every check, including the rejection of a file that
  claims to be an image but is not.

### Figures

Captions are written to state the claim, not to describe the interface. Place each
one directly under its image. File names refer to `docs/screenshots/`.

Figure 1. The editor after a photograph is loaded. The left column lists the
fields read from the file and the context reconstructed for it, the Style group
below them carries the preset, tone, accent, type and plate controls, and the
canvas shows the composition that will be exported. (`01-editor-exif.jpg`)

Figure 2. The reconstructed fields with their values. The small information
control on each row names the service that produced it. The peaks row depends on a
volunteer-run map database that was saturated during capture, so that one row
states a reason instead of a value. (`02-derived.png`)

Figure 3. The same panel for a photograph that passed through a messaging
application. Its metadata was stripped, so every row reports what is missing
rather than disappearing. (`03-degraded.png`)

Figure 4. One photograph with the three overlay presets, all at the default
corner radius and in the mono face: plate along the bottom, corner block, and
strip. Presets change arrangement only; the enabled fields are identical in all
three. (`04-presets.jpg`)

Figure 5. The map overlay opened from the coordinates row. The pin marks the
location used for reconstruction, and the readout shows the coordinates and the
resolved place name. Dragging the pin or clicking the map updates both.
(`05-map.jpg`)

Figure 6. The exported file at full resolution, 4080 by 3060 pixels, opened in an
image viewer. The overlay is drawn at the photograph's own size rather than
scaled up from the preview. (`06-export.jpg`)

Figure 7. The share page for a saved gallery, opened in a separate tab. It
renders the same overlay from the stored context and offers a download.
(`07-share.jpg`)

Figure 8. The editor at 380 pixels wide. The sidebar becomes a bottom sheet and
the canvas keeps the photograph's aspect ratio. (`08-mobile.jpg`)

Figure 9. The SQLite table that backs all of it, read with `sqlite3 data/app.db`.
Each row is one gallery: a slug, the stored overlay configuration, the resolved
context as JSON, and paths to the image and its thumbnail, never the bytes
themselves. (your own capture)

Figure 10. The Style panel, which is where the overlay is configured: preset,
tone, accent colour and accent rule, font scale, typeface, corner radius,
opacity, and the plate's normalised position with a reset. The values shown are
the ones used for the customised plate in Figure 10b. (`10-style-controls.png`)

Figure 10b. The plate that those settings produce, at three states of the
customisation: corner radius 0, corner radius 1.5, and the default radius in the
sans face. Both properties are stored with the gallery, so reopening it from
Recent or opening its share link reproduces the same plate.
(`10b-plate-customisation.jpg`)

**Not numbered: the 1 to 1 crop.** `06-export-100.jpg` is the same export shown
at one image pixel per screen pixel, which is what an image viewer calls 100
percent. A 4080 pixel wide file is several times wider than a page, so the crop
can only show a region, which is why it looks like the overlay with photo around
it rather than a whole picture. It exists for one claim only: that the overlay
text is drawn at the file's own resolution and not enlarged from the preview,
which is invisible in Figure 6 because any downscaled image looks sharp. If you
do not want to make that claim, leave the crop out; nothing else depends on it.

### Limitations

The application is single user and has no authentication; anyone who can reach the
port can save or delete a gallery. Uploads are limited to JPEG and PNG, so HEIC
files from an iPhone must be converted first, which the camera settings can do.
The peaks field depends on a public volunteer-run service and therefore degrades
to a message whenever all mirrors are saturated, although results are cached for a
day. Saved galleries can be deleted but not edited; sharing identical content
returns the existing link, while any change creates a new record, including a
change of corner radius or typeface. Type is self-hosted, so no font is fetched
from a third party, but the editor still loads Leaflet from a content delivery
network for the map overlay, so the app is not offline in the strict sense. A
gallery saved before the plate properties existed mints one duplicate record the
first time it is shared again, because the fingerprint changed. The overlay is
capped at 4096 pixels on the long edge, which is above every phone photograph
used during development but would downscale a very large scanned image.
