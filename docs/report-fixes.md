# Report fixes: four edits to the version exported on 23 November

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
