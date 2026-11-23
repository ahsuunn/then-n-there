// Native-resolution export. The editor preview, the share view and this module
// all call the one renderer in js/hud.js, so the file a visitor downloads
// carries the same HUD as the preview, only at the photo's own pixel size.
//
// The canvas here is offscreen: it is never attached to the document, it is
// sized from the decoded image (with the same 4096 cap the editor uses), and it
// resolves a Blob through toBlob. Nothing in this module knows about a field
// list; the registry is handed in.

import { renderHUD } from './hud.js';
import { hudFontsReady } from './fonts.js';

// The longest edge an export or a preview may use. The editor preview uses the
// same cap, so a 4096px export and a 4096px preview share one coordinate space.
export const MAX_EXPORT_EDGE = 4096;

export const EXPORT_FORMATS = {
  png: { format: 'png', type: 'image/png', ext: 'png', label: 'PNG' },
  jpeg: { format: 'jpeg', type: 'image/jpeg', ext: 'jpg', label: 'JPEG' },
};

// The size the export canvas will have. A phone photo under the cap exports at
// exactly its own pixel dimensions; anything larger is scaled down once, on the
// long edge, never upscaled.
export function exportSize(image) {
  const width = Math.max(0, Math.round(Number(image && image.width) || 0));
  const height = Math.max(0, Math.round(Number(image && image.height) || 0));
  const scale = Math.min(1, MAX_EXPORT_EDGE / Math.max(width || 1, height || 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Render the photo and its HUD at native size and resolve a Blob.
//
// opts: { format: "png" | "jpeg", quality } - PNG is the default, JPEG uses
// 0.92 unless a quality is given. `hudConfig` is the section 4 HUD config, so
// the same normalised position lands in the same relative place at any size.
export async function renderToBlob(imageBitmap, fields, hudConfig, opts = {}) {
  if (!imageBitmap) throw new Error('There is no photo to export.');

  const format = resolveFormat(opts);
  const quality =
    format.format === 'jpeg' ? clampQuality(opts.quality, 0.92) : undefined;

  // A font that lands after the first paint would export fallback glyphs, so
  // wait for the same font state the preview settled on.
  await hudFontsReady();

  const { width, height } = exportSize(imageBitmap);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not open an export canvas.');

  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(imageBitmap, 0, 0, width, height);
    renderHUD(ctx, imageBitmap, fields, hudConfig || {});
    return await toBlob(canvas, format.type, quality);
  } finally {
    // Release the backing store now rather than at the next GC.
    canvas.width = 0;
    canvas.height = 0;
  }
}

// The download filename: then-n-there-<ISO timestamp>.<ext>. Colons and dots are
// legal in an ISO string but not in a Windows filename, so the timestamp keeps
// its shape with those two characters swapped for hyphens.
export function exportName(format = 'png', date = new Date()) {
  const ext = resolveFormat({ format }).ext;
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `then-n-there-${stamp}.${ext}`;
}

// Save a Blob under a filename. Shared by the editor and the share page so the
// download path is identical on both surfaces.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function resolveFormat(opts = {}) {
  const raw = String(opts.format || opts.type || 'png').toLowerCase();
  if (raw === 'jpeg' || raw === 'jpg' || raw === 'image/jpeg') {
    return EXPORT_FORMATS.jpeg;
  }
  return EXPORT_FORMATS.png;
}

function clampQuality(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.1, n));
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The export canvas produced no image.'));
      },
      type,
      quality
    );
  });
}
