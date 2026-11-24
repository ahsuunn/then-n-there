# Report fixes

Round one (items 1 to 4) is applied in the 16-page export and verified. Round
two (items 5 and 6) is what the 16-page export still needs.

The exported PDF is `docs/3_Assignment_Report.pdf`, 15 pages. All eight figures in
it are the current files, so nothing there needs replacing. Four text passages are
stale, and two of them contradict the page they sit on.

Each item below gives the sentence to find and delete, then the paragraph to paste
in its place. Nothing else in the document changes.

---

## 1. Section 3, Results, the reconstructed values bullet (page 9)

Contradicts every figure, which show Gyeongju, 1.1 C, 53 m and 280 degrees.

**Delete this bullet:**

```
Reconstructed values for the demonstration photograph, taken in Seoul on 20
November 2026 at 21:11, resolved to the place name, minus 1.6 degrees Celsius with
a clear sky, a ground elevation of 42 metres, night with a solar azimuth of 281
degrees, and a waxing gibbous moon at 80 percent illumination.
```

**Paste this bullet:**

```
Reconstructed values for the demonstration photograph, taken at Donggung Palace
and Wolji Pond in Gyeongju on 20 November 2026 at 21:11, resolved to the place
name, 1.1 degrees Celsius with a clear sky, a ground elevation of 53 metres, night
with a solar azimuth of 280 degrees, and a waxing gibbous moon at 80 percent
illumination.
```

---

## 2. Figure 2 caption (page 10)

The caption claims the peaks row resolved to Namsan at 1.8 km. The image directly
above it reads "Overpass unavailable", so the row states a reason instead.

**Delete this caption:**

```
The reconstructed fields with their values. The small information control on each
row names the service that produced it. The peaks row reads the nearest named
summits from a volunteer-run map database, here Namsan at 1.8 km with two more
behind the count.
```

**Paste this caption:**

```
The reconstructed fields with their values. The small information control on each
row names the service that produced it. The peaks row depends on a volunteer-run
map database that was saturated during capture, so that one row states a reason
instead of a value.
```

---

## 3. Figure 4 caption (page 12)

The image is now three panels stacked vertically, drawn at the default corner
radius in the mono face, and the caption predates both controls.

**Delete this caption:**

```
One photograph with the three overlay presets: plate along the bottom, corner
block, and strip. Presets change arrangement only; the enabled fields are
identical in all three.
```

**Paste this caption:**

```
One photograph with the three overlay presets, all at the default corner radius
and in the mono face: plate along the bottom, corner block, and strip. Presets
change arrangement only; the enabled fields are identical in all three.
```

---

## 4. Section 2.6, add a paragraph at the end

The Limitation on the last page already talks about a fingerprint and about a
duplicate record, but nothing earlier defines what identifies a gallery. Add this
as the last paragraph of 2.6, after "... works with the network disabled."

```
A gallery is identified by its content. The editor hashes the photograph's bytes
together with a canonical form of the overlay configuration and the resolved
context, and the server returns the existing record when that fingerprint is
already known. Sharing the same photo twice therefore yields one link, while
changing a field, dragging the plate, correcting the pin or changing either plate
property produces a different fingerprint and a new record. A link that has been
sent is never altered later, because nothing is overwritten.
```

---

## Two optional, non-blocking

- Figure 8 caption opens "The editor is 380 pixels wide". "The editor at 380
  pixels wide" reads better, and matches the other captions, which are not
  sentences.
- The SQLite figure is gone from this version, so the report has no database
  screenshot. The Implementation table still lists Database as an item. If the
  marker wants evidence for that row, that is the figure to bring back; if not,
  leave it out. Nothing else refers to it.

---

## After the four edits

Re-export as `50261896.pdf`. A quick check that the edits landed:

```
pdftotext -layout 50261896.pdf - | grep -ci "gyeongju\|53 metres\|280 degrees"
pdftotext -layout 50261896.pdf - | grep -ci "seoul"
pdftotext -layout 50261896.pdf - | grep -ci "identified by its content"
```

The first should be 3 or more, the second 0, the third 1. The limitation text may
still say "a gallery saved before the plate properties existed", which refers to
the same fingerprint paragraph, so it stays.

---

# Round two, for the 16-page export

Items 1 to 4 are now correct in the file. Two problems remain, both in the last
figure row and in one sentence of section 3.

## 5. Figure 9 row splits across a page break

The row starts on page 14 and ends on page 15, where it leaves an orphan cell
containing only "never the bytes themselves" with an empty number and photo
column. The database image is also 1016 by 168 inside a narrow column, so it is
unreadable at fit-width, and the caption contains literal backticks around
sqlite3 that print as characters.

Two changes:

- Crop the screenshot to the table only, without the shell prompt and without
  surrounding terminal, and make it as wide as the photo column allows. If that
  is still unreadable, delete the row: the Database item is already evidenced by
  the Recent list in Figure 8 and by the share page in Figure 7.
- Replace the caption with this shorter one and remove the backticks:

```
The SQLite table behind every gallery, read with sqlite3 data/app.db. A row holds a slug, the stored overlay configuration, the resolved context as JSON, and paths to the image and thumbnail, never the bytes.
```

That is short enough for the row to stay on one page in most cases. Google Docs
will not let a page break sit inside a table, so if the row still splits, free
vertical space above it instead: drag the right edge of the Figure 8 mobile image
left until it is about two thirds of the cell width. A 760 by 1520 image shrinks
by the same ratio, which returns roughly two and a half centimetres on the page,
and the row then fits.

## 6. Section 3, the typeface measurement is under-specified

The bullet reads "563 pixels wide in the mono face against 524 in the sans face".
Those numbers came from a two-field probe, not from the four-field plate the
application draws, so a reader cannot reproduce them. Measured again on the real
four-field plate in a 1200 by 800 frame: 665 pixels mono, 612 sans, eight percent
narrower.

**Replace the whole bullet with:**

```
Corner radius is a multiplier over each preset's own radius, so 0 draws a square
plate and 1.5 a very round one. Switching typeface re-measures the plate rather
than only restyling it: for the four-field plate in a 1200 by 800 frame, the mono
face is 665 pixels wide and the sans face 612, eight percent narrower, recentred
on the same point. Both values travel in the stored config, and a record saved as
a square sans plate renders the same way when its share link is opened.
```

## Length

The template sets no page limit. 16 pages is 2,850 words of prose plus nine
figures, and the figure table accounts for about five of those pages. That is not
long for a report with a rubric row per figure. Compaction would cost evidence,
not words: the only shortening worth doing is the Figure 9 row above. Leave the
rest.

---

# Round three, after the duplicate galleries were removed

The database now holds one gallery, saved at the pin the figures use, so the
Recent list in the application shows a single item. Two documents of this:

## 7. Say where the coordinates came from

Without this, a reader compares the figures, which show coordinates, with their
own run, where the same file reports no GPS and the pin must be placed by hand,
and concludes the figures were staged. Add this as a bullet in section 3,
directly after the reconstructed-values bullet:

```
The demonstration photograph carries a GPS block whose values are all NaN, so the location was set once with the map overlay and stored with the gallery; every location-derived field follows from that pin.
```

## 8. Figures 1 and 8 show a three-item Recent list

Both were shot before the duplicates were removed, so they show Gyeongju, Seoul
and Gyeongju while the application now shows one gallery. Nothing in the text
refers to the list length, and the list is not what those figures are about, so
leaving them is defensible. If you want them to match exactly, they are the only
two figures that need re-shooting.

---

# Round four, wording

Two words to change. The first is a term I introduced and never defined, the
second is simply the wrong word.

## 9. "demonstration photograph" reads as if the photograph were a demo

It means the one photograph used in every figure, the Gyeongju night shot. The
assignment has no notion of a demonstration, so name it plainly.

Replace "demonstration photograph" with "sample photograph" in these two bullets
in section 3:

```
An exported PNG of the 4080 by 3060 sample photograph is exactly 4080 by 3060, ...
Reconstructed values for the sample photograph, taken at Donggung Palace and
Wolji Pond in Gyeongju on 20 November 2026 at 21:11, ...
```

## 10. "The demonstration consequence" is not English

In section 2.7 it currently reads:

```
The demonstration consequence is that the editor, the overlay, the export, the
map correction and every saved gallery keep working offline; ...
```

Replace "demonstration" with "practical":

```
The practical consequence is that the editor, the overlay, the export, the map
correction and every saved gallery keep working offline; ...
```

---

# Round five: one figure for the plate customisation

The text already covers it in 2.5 and in the Results bullet, but nothing shows
it. Add a tenth row at the end of the figure table, after the SQLite row, so no
existing figure renumbers.

**Image:** `docs/screenshots/09-hud-customisation.jpg` (900 by 1176). Three
crops of the same plate, stacked: square, very round, then default radius in the
sans face.

**Row: 10. Paste this as the description:**

```
The same plate three times: corner radius 0, corner radius 1.5, and the default radius in the sans face. The radius multiplier and the typeface are stored with the gallery, so reopening it from Recent or opening its share link reproduces the same plate.
```

Nothing else in the document changes. Re-export, and the zip needs rebuilding so
the archive carries the new PDF.
