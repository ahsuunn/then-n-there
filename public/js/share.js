// Share view. Read-only: no sidebar, no toggles, no drag. It rebuilds the
// picture from what the record saved: the stored image, that image's own EXIF,
// the context snapshot, and the HUD config, then paints with the same
// js/hud.js the editor uses, so both surfaces show one renderer's output.
//
// Nothing here queries the reconstruction network. A share link works from the
// snapshot alone, and the download reuses js/export.js at native size.

import { readExif } from './exif.js';
import { buildFields } from './fields.js';
import { renderHUD } from './hud.js';
import {
  downloadBlob,
  exportName,
  exportSize,
  renderToBlob,
} from './export.js';

const slug = decodeURIComponent(
  window.location.pathname.replace(/^\/s\//, '').replace(/\/+$/, '')
);

const els = {
  stage: document.getElementById('stage'),
  canvas: document.getElementById('hudCanvas'),
  status: document.getElementById('status'),
  note: document.getElementById('note'),
  download: document.getElementById('downloadButton'),
};

const ctx = els.canvas.getContext('2d');

let imageBitmap = null;
let fields = [];
let hudConfig = {};
let exporting = false;

// The decoded photo owns memory outside the JS heap, so a replaced bitmap is
// released rather than left to the collector. The <img> fallback from
// decodeImage has no close(), so the guard keeps that path safe.
function releaseBitmap() {
  if (imageBitmap && typeof imageBitmap.close === 'function') {
    imageBitmap.close();
  }
  imageBitmap = null;
}

function adoptBitmap(next) {
  if (imageBitmap === next) return;
  releaseBitmap();
  imageBitmap = next;
}

// A page that is really going away gives its pixels back immediately. One that
// enters the back/forward cache keeps them, because it is restored as is.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) releaseBitmap();
});

load();

async function load() {
  if (!slug) {
    fail('This share link has no photo.');
    return;
  }

  try {
    const res = await fetch(`/api/galleries/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      fail(
        res.status === 404
          ? 'This share link does not exist.'
          : 'Could not load this photo.'
      );
      return;
    }
    const record = await res.json();
    await render(record);
  } catch {
    fail('Could not load this photo.');
  }
}

async function render(record) {
  const imageRes = await fetch(record.imagePath);
  if (!imageRes.ok) throw new Error('The saved image could not be loaded.');

  const blob = await imageRes.blob();
  const filename = String(record.imagePath).split('/').pop() || 'photo.jpg';
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

  // Decode before the swap, so a failed decode leaves the current photo intact.
  const bitmap = await decodeImage(file);
  adoptBitmap(bitmap);

  // The photo's own EXIF is the first half of the registry; the saved snapshot
  // is the second. No lookup runs here.
  const exif = await readExif(file);
  if (exif.width == null) exif.width = bitmap.width;
  if (exif.height == null) exif.height = bitmap.height;

  hudConfig =
    record.hudConfig && typeof record.hudConfig === 'object'
      ? record.hudConfig
      : {};

  fields = buildFields(exif, hudConfig, normalizeSnapshot(record.context));
  applyEnabledFields(fields, hudConfig.fields);

  paint();
  els.stage.hidden = false;
  els.status.textContent = '';
  els.note.hidden = false;
  els.download.disabled = false;
  document.title = `${placeName(record.context) || 'Photo'} · Then & There`;
}

// The canvas is the photo at its own pixel size (capped at 4096, the same cap
// as the editor and the export), and CSS scales it to the viewport. The HUD is
// drawn at that full size, so text stays crisp instead of being upscaled.
function paint() {
  if (!imageBitmap) return;

  const { width, height } = exportSize(imageBitmap);
  if (els.canvas.width !== width) els.canvas.width = width;
  if (els.canvas.height !== height) els.canvas.height = height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  renderHUD(ctx, imageBitmap, fields, hudConfig);
}

// Only the fields the record listed stay on, and only if this photo can still
// resolve them. The registry keeps the rest, so an unavailable field degrades
// the same way it does in the editor.
function applyEnabledFields(list, stored) {
  if (!Array.isArray(stored)) return;
  const enabled = new Set(stored);
  for (const field of list) {
    if (field.group === 'style') continue;
    field.enabled = field.available && enabled.has(field.id);
  }
}

function normalizeSnapshot(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const coords =
    c.coords &&
    Number.isFinite(c.coords.lat) &&
    Number.isFinite(c.coords.lon)
      ? { lat: c.coords.lat, lon: c.coords.lon }
      : null;
  return {
    place: c.place ?? null,
    weather: c.weather ?? null,
    elevation:
      typeof c.elevation === 'number' && Number.isFinite(c.elevation)
        ? c.elevation
        : null,
    peaks: Array.isArray(c.peaks) ? c.peaks : null,
    sun: c.sun ?? null,
    moon: c.moon ?? null,
    // The corrected pin, when the author moved it on the map.
    coords,
  };
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> decoding
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

function fail(message) {
  els.status.textContent = message;
  els.stage.hidden = true;
  els.note.hidden = true;
  els.download.disabled = true;
}

function placeName(context) {
  const place = context && context.place;
  if (!place) return null;
  if (typeof place === 'string') return place;
  return [place.name, place.country].filter(Boolean).join(', ') || null;
}

// ---- download ----

// The download renders the same canvas through js/export.js, so the file is the
// photo at native size with the HUD, not a screenshot of this page.
els.download.addEventListener('click', download);

async function download() {
  if (!imageBitmap || exporting) return;
  exporting = true;

  const idle = els.download.textContent;
  els.download.textContent = 'Exporting';
  els.download.disabled = true;

  try {
    const blob = await renderToBlob(imageBitmap, fields, hudConfig, {
      format: 'png',
    });
    downloadBlob(blob, exportName('png'));
  } catch {
    els.status.textContent = 'Could not export this photo.';
  } finally {
    exporting = false;
    els.download.textContent = idle;
    els.download.disabled = false;
  }
}

// The first paint may land before the mono face, so repaint once the fonts the
// editor also waits for are ready.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => paint());
}
