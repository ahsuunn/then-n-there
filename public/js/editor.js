// Editor wiring: top bar, sidebar groups, canvas lifecycle, drop intake, and
// the share action. The canvas and the sidebar both read the field registry;
// neither hardcodes a field list.

import { state } from './state.js';
import { readExif } from './exif.js';
import { buildFields, enabledFieldIds } from './fields.js';
import { toast, setBusy } from './ui.js';

const MAX_BYTES = 15 * 1024 * 1024;
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const els = {
  app: document.getElementById('app'),
  fileInput: document.getElementById('fileInput'),
  pickButton: document.getElementById('pickButton'),
  shareButton: document.getElementById('shareButton'),
  stage: document.getElementById('stage'),
  canvas: document.getElementById('hudCanvas'),
  stageEmpty: document.getElementById('stageEmpty'),
  emptyPick: document.getElementById('emptyPick'),
  groupSource: document.getElementById('group-source'),
  groupDerived: document.getElementById('group-derived'),
  groupStyle: document.getElementById('group-style'),
  sharePopover: document.getElementById('sharePopover'),
  shareUrl: document.getElementById('shareUrl'),
  copyButton: document.getElementById('copyButton'),
  openLink: document.getElementById('openLink'),
};

const ctx = els.canvas.getContext('2d');
let imageBitmap = null; // decoded photo, drawn fit-to-box

// ---- initial render (no photo yet) ----
state.fields = buildFields(null, state.hud);
renderSidebar();
renderCanvas();

// ---- file intake ----

els.pickButton.addEventListener('click', () => els.fileInput.click());
els.emptyPick.addEventListener('click', () => els.fileInput.click());

els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files && els.fileInput.files[0];
  if (file) handleFile(file);
  els.fileInput.value = '';
});

// Drop anywhere on the window; never navigate.
['dragover', 'dragenter'].forEach((type) =>
  window.addEventListener(type, (event) => {
    event.preventDefault();
    if (hasFiles(event)) els.app.classList.add('dragging');
  })
);

['dragleave', 'drop'].forEach((type) =>
  window.addEventListener(type, (event) => {
    event.preventDefault();
    els.app.classList.remove('dragging');
  })
);

window.addEventListener('drop', (event) => {
  event.preventDefault();
  els.app.classList.remove('dragging');
  const file =
    event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) handleFile(file);
});

function hasFiles(event) {
  return (
    event.dataTransfer &&
    Array.from(event.dataTransfer.types).includes('Files')
  );
}

async function handleFile(file) {
  if (file.type && !/^image\/(jpeg|png)$/i.test(file.type)) {
    toast('Please choose a JPEG or PNG photo.', 'error');
    return;
  }
  if (file.size > MAX_BYTES) {
    toast('That file is too large. The limit is 15 MB.', 'error');
    return;
  }

  let bitmap;
  try {
    bitmap = await decodeImage(file);
  } catch {
    toast('Could not read that image.', 'error');
    return;
  }

  const exif = await readExif(file);
  if (exif.width == null) exif.width = bitmap.width;
  if (exif.height == null) exif.height = bitmap.height;

  imageBitmap = bitmap;
  const fields = buildFields(exif, state.hud);
  state.set({
    image: { file, width: bitmap.width, height: bitmap.height },
    exif,
    fields,
  });
  state.hud.fields = enabledFieldIds(fields);

  renderSidebar();
  renderCanvas();
  closeShare();
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

// ---- sidebar ----

function renderSidebar() {
  renderGroup(els.groupSource, state.fields.filter((f) => f.group === 'source'));
  renderGroup(els.groupDerived, state.fields.filter((f) => f.group === 'derived'));
  renderGroup(els.groupStyle, state.fields.filter((f) => f.group === 'style'));
  els.shareButton.disabled = !state.image;
}

function renderGroup(container, fields) {
  container.textContent = '';
  const frag = document.createDocumentFragment();
  for (const field of fields) frag.appendChild(buildRow(field));
  container.appendChild(frag);
}

function buildRow(field) {
  const label = document.createElement('label');
  label.className = 'row' + (field.available ? '' : ' is-unavailable');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.id = `field-${field.id}`;
  input.dataset.id = field.id;
  input.dataset.group = field.group;
  input.checked = field.enabled;
  input.disabled = !field.available;
  input.addEventListener('change', () => onToggle(field.id, input.checked));

  const name = document.createElement('span');
  name.className = 'row-label';
  name.textContent = field.label;

  const value = document.createElement('span');
  value.className = 'row-value';
  value.textContent = field.available ? field.value ?? '' : field.reason ?? '';

  label.append(input, name, value);
  label.title = field.available ? field.label : field.reason ?? '';
  return label;
}

function onToggle(id, checked) {
  const field = state.fields.find((f) => f.id === id);
  if (!field) return;

  if (field.group === 'style') {
    if (id === 'tone') {
      state.hud.tone = checked ? 'dark' : 'light';
      field.value = checked ? 'Dark' : 'Light';
    } else if (id === 'preset') {
      state.hud.plateVisible = checked;
      field.value = checked ? 'Plate' : 'Off';
    }
    field.enabled = checked;
    updateRowValue(id, field.value);
  } else {
    field.enabled = checked;
    if (checked) {
      if (!state.hud.fields.includes(id)) state.hud.fields.push(id);
    } else {
      state.hud.fields = state.hud.fields.filter((x) => x !== id);
    }
  }

  renderCanvas();
}

function updateRowValue(id, text) {
  const input = document.getElementById(`field-${id}`);
  const row = input && input.closest('.row');
  if (row) {
    const value = row.querySelector('.row-value');
    if (value) value.textContent = text;
  }
}

// ---- canvas ----

function renderCanvas() {
  if (!imageBitmap) {
    els.canvas.style.display = 'none';
    els.stageEmpty.hidden = false;
    return;
  }
  els.stageEmpty.hidden = true;
  els.canvas.style.display = 'block';

  // Backing store is the photo itself, so preview and export share one
  // coordinate space and one set of pixels.
  const iw = imageBitmap.width;
  const ih = imageBitmap.height;
  const cap = 4096;
  const scale = Math.min(1, cap / Math.max(iw, ih));
  const cw = Math.max(1, Math.round(iw * scale));
  const ch = Math.max(1, Math.round(ih * scale));

  if (els.canvas.width !== cw || els.canvas.height !== ch) {
    els.canvas.width = cw;
    els.canvas.height = ch;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(imageBitmap, 0, 0, cw, ch);

  if (state.hud.plateVisible) drawPlate({ x: 0, y: 0, w: cw, h: ch });
}

// Minimal placeholder plate: mono text, amber rule, bottom left. The real HUD
// renderer (js/hud.js) lands in phase 5; this proves the toggle behaviour now.
function drawPlate(photoRect) {
  const rows = state.fields.filter(
    (f) => f.group !== 'style' && f.available && f.enabled
  );
  if (rows.length === 0) return;

  const dark = state.hud.tone !== 'light';
  const palette = dark
    ? { bg: 'rgba(11,12,14,0.72)', ink: '#e8eaed', muted: '#9aa1ab' }
    : { bg: 'rgba(255,255,255,0.78)', ink: '#14161a', muted: '#5f6368' };
  const accent = state.hud.accent;

  // Everything scales off the photo width, so the plate reads the same on a
  // 600px preview and on a 3264px export.
  const unit = Math.max(14, Math.round(photoRect.w * 0.021));
  const padX = Math.round(unit * 1.2);
  const padY = Math.round(unit * 1.1);
  const lineHeight = Math.round(unit * 1.55);
  const gap = Math.round(unit * 1.4);
  const inset = Math.round(unit * 1.1);
  const radius = Math.round(unit * 0.6);
  const font = `500 ${unit}px ${MONO}`;

  ctx.font = font;
  const labels = rows.map((r) => r.label.toUpperCase());
  const values = rows.map((r) => r.value ?? '');
  let maxLabel = 0;
  let maxValue = 0;
  for (let i = 0; i < rows.length; i++) {
    maxLabel = Math.max(maxLabel, ctx.measureText(labels[i]).width);
    maxValue = Math.max(maxValue, ctx.measureText(values[i]).width);
  }

  const plateW = padX * 2 + maxLabel + gap + maxValue;
  const plateH = padY * 2 + rows.length * lineHeight;

  // Bottom-left, clamped so the plate stays on the photo.
  let px = photoRect.x + inset;
  let py = photoRect.y + photoRect.h - plateH - inset;
  px = Math.max(photoRect.x, Math.min(px, photoRect.x + photoRect.w - plateW));
  py = Math.max(photoRect.y, Math.min(py, photoRect.y + photoRect.h - plateH));

  roundRect(ctx, px, py, plateW, plateH, radius);
  ctx.fillStyle = palette.bg;
  ctx.fill();

  // Amber rule.
  ctx.fillStyle = accent;
  ctx.fillRect(px, py, plateW, Math.max(2, Math.round(unit * 0.18)));

  ctx.textBaseline = 'middle';
  const textTop = py + padY + lineHeight / 2;
  for (let i = 0; i < rows.length; i++) {
    const y = textTop + i * lineHeight;
    ctx.font = font;
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'left';
    ctx.fillText(labels[i], px + padX, y);
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'right';
    ctx.fillText(values[i], px + plateW - padX, y);
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (c.roundRect) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    return;
  }
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---- sharing ----

els.shareButton.addEventListener('click', share);
els.copyButton.addEventListener('click', copyShareUrl);

async function share() {
  if (!state.image) return;
  setBusy(els.shareButton, true, 'Sharing');
  try {
    const payload = {
      hudConfig: {
        preset: state.hud.preset,
        tone: state.hud.tone,
        accent: state.hud.accent,
        fontScale: state.hud.fontScale,
        opacity: state.hud.opacity,
        align: state.hud.align,
        fields: state.hud.fields,
      },
      context: contextSnapshot(),
    };
    const form = new FormData();
    form.append('image', state.image.file);
    form.append('payload', JSON.stringify(payload));
    const res = await fetch('/api/galleries', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'Upload failed');
    showShare(data.slug);
  } catch (err) {
    toast(err.message || 'Upload failed', 'error');
  } finally {
    setBusy(els.shareButton, false);
  }
}

function contextSnapshot() {
  const e = state.exif || {};
  return {
    capturedAt: e.capturedAt ?? null,
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
  };
}

function showShare(slug) {
  const url = new URL(`/s/${slug}`, window.location.origin).href;
  els.shareUrl.value = url;
  els.openLink.href = url;
  positionPopover();
  els.sharePopover.hidden = false;
}

function positionPopover() {
  const btn = els.shareButton.getBoundingClientRect();
  els.sharePopover.style.top = `${btn.bottom + 8}px`;
  els.sharePopover.style.right = `${window.innerWidth - btn.right}px`;
}

function closeShare() {
  els.sharePopover.hidden = true;
}

function copyShareUrl() {
  navigator.clipboard
    .writeText(els.shareUrl.value)
    .then(() => toast('Link copied'))
    .catch(() => {
      els.shareUrl.select();
      document.execCommand('copy');
    });
}

document.addEventListener('click', (event) => {
  if (
    !els.sharePopover.hidden &&
    !els.sharePopover.contains(event.target) &&
    event.target !== els.shareButton
  ) {
    closeShare();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeShare();
});

// ---- canvas keeps up with the stage and the font load ----

const observer =
  typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => renderCanvas())
    : null;
if (observer) observer.observe(els.stage);
else window.addEventListener('resize', () => renderCanvas());

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => renderCanvas());
}
