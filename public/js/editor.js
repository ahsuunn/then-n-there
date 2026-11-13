// Editor wiring: top bar, sidebar groups, canvas lifecycle, drop intake,
// reconstruction and the share action. The canvas and the sidebar both read
// the field registry; neither hardcodes a field list.

import { state } from './state.js';
import { readExif } from './exif.js';
import { buildFields, enabledFieldIds, fieldSource } from './fields.js';
import { reconstructContext, pendingFieldIds } from './reconstruct.js';
import {
  HUD_PRESETS,
  layoutHUD,
  presetDefaults,
  renderHUD,
  snapBox,
} from './hud.js';
import { toast, setBusy } from './ui.js';

const MAX_BYTES = 15 * 1024 * 1024;
const SNAP_SCREEN_PX = 24;
const PRESET_LABELS = { plate: 'Plate', corner: 'Corner', strip: 'Strip' };
const TONE_OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

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

// Drag state for the plate. Box dimensions are captured on pointerdown so the
// plate follows the pointer without re-measuring mid-gesture.
const drag = {
  active: false,
  pointerId: null,
  grabX: 0,
  grabY: 0,
  width: 0,
  height: 0,
};

// STYLE controls that are not registry switches. Kept so a preset change can
// repaint their values without rebuilding the sidebar (and losing focus).
const styleInputs = {
  preset: null,
  tone: null,
  accent: null,
  accentText: null,
  fontScale: null,
  fontScaleText: null,
  opacity: null,
  opacityText: null,
  position: null,
};

// Reconstruction state. `context` is the section 4 snapshot; `pendingIds` is
// the set of derived rows still in flight; `runToken` discards stale results
// when a new photo lands before the previous lookups finish.
let context = null;
let pendingIds = new Set();
let runToken = 0;
let sourcePopover = null;

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
  runToken += 1;
  const token = runToken;
  context = null;
  pendingIds = new Set(pendingFieldIds(exif));

  const fields = buildFields(exif, state.hud);
  state.set({
    image: { file, width: bitmap.width, height: bitmap.height },
    exif,
    context: null,
    fields,
  });
  state.hud.fields = enabledFieldIds(fields);

  renderSidebar();
  renderCanvas();
  closeShare();

  resolveContext(exif, token);
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

// ---- reconstruction ----

async function resolveContext(exif, token) {
  if (pendingIds.size === 0) return;

  const result = await reconstructContext(exif, {
    onResult(kind, value) {
      if (token !== runToken) return;
      if (!context) context = emptyContext();
      context[kind] = value;
      pendingIds.delete(kind);
      state.context = context;

      rebuildFields();
      renderGroup(
        els.groupDerived,
        state.fields.filter((f) => f.group === 'derived')
      );
      renderCanvas();
    },
  });

  if (token !== runToken) return;
  context = result;
  pendingIds = new Set();
  state.context = context;
  rebuildFields();
  renderSidebar();
  renderCanvas();
}

function emptyContext() {
  return {
    place: null,
    weather: null,
    elevation: null,
    peaks: null,
    sun: null,
    moon: null,
  };
}

// Rebuild the registry after a lookup lands without resetting toggles the
// user already made on rows that were available before.
function rebuildFields() {
  const previous = new Map();
  for (const field of state.fields) {
    if (field.available) previous.set(field.id, field.enabled);
  }

  const fields = buildFields(state.exif, state.hud, context);
  for (const field of fields) {
    if (field.available && previous.has(field.id)) {
      field.enabled = previous.get(field.id);
    }
  }

  state.fields = fields;
  state.hud.fields = enabledFieldIds(fields);
}

// ---- sidebar ----

function renderSidebar() {
  renderGroup(els.groupSource, state.fields.filter((f) => f.group === 'source'));
  renderGroup(els.groupDerived, state.fields.filter((f) => f.group === 'derived'));
  renderStyleGroup();
  els.shareButton.disabled = !state.image;
}

function renderGroup(container, fields) {
  container.textContent = '';
  const frag = document.createDocumentFragment();
  for (const field of fields) frag.appendChild(buildRow(field));
  container.appendChild(frag);
}

function buildRow(field) {
  const pending = pendingIds.has(field.id);

  const row = document.createElement('div');
  row.className =
    'row' +
    (field.available ? '' : ' is-unavailable') +
    (pending ? ' is-pending' : '');
  row.dataset.id = field.id;

  const label = document.createElement('label');
  label.className = 'row-main';
  label.htmlFor = `field-${field.id}`;

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

  label.append(input, name);

  const value = document.createElement('span');
  value.className = 'row-value';
  value.textContent = pending
    ? 'resolving'
    : field.available
      ? field.value ?? ''
      : field.reason ?? '';

  row.append(label, value);

  if (field.group !== 'style') {
    const provenance = fieldSource(field, state.exif);
    row.title = pending
      ? `Resolving from ${provenance}`
      : field.available
        ? provenance
        : `${field.reason ?? 'Unavailable'}. ${provenance}`;

    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'row-info';
    info.textContent = 'i';
    info.setAttribute('aria-label', `Source for ${field.label}`);
    info.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showSource(field, info);
    });
    row.append(info);
  }

  return row;
}

// ---- style group ----

// The registry decides which STYLE rows exist. Preset and tone get segmented
// controls because a switch cannot express three presets; every other style
// row still falls back to the registry switch.
function renderStyleGroup() {
  els.groupStyle.textContent = '';
  const frag = document.createDocumentFragment();

  for (const field of state.fields) {
    if (field.group !== 'style') continue;

    if (field.id === 'preset') {
      const preset = segmentedRow(
        'preset',
        field.label,
        HUD_PRESETS.map((value) => ({
          value,
          label: PRESET_LABELS[value] || value,
        })),
        state.hud.preset,
        setPreset
      );
      styleInputs.preset = preset.group;
      frag.appendChild(preset.row);
    } else if (field.id === 'tone') {
      const tone = segmentedRow(
        'tone',
        field.label,
        TONE_OPTIONS,
        state.hud.tone,
        setTone
      );
      styleInputs.tone = tone.group;
      frag.appendChild(tone.row);
    } else {
      frag.appendChild(buildRow(field));
    }
  }

  const accent = accentRow();
  styleInputs.accent = accent.input;
  styleInputs.accentText = accent.readout;
  frag.appendChild(accent.row);

  const fontScale = rangeRow({
    id: 'fontScale',
    label: 'Font scale',
    min: 0.7,
    max: 2,
    step: 0.05,
    value: state.hud.fontScale,
    format: (value) => `${value.toFixed(2)}x`,
    onInput(value) {
      state.hud.fontScale = value;
      renderCanvas();
    },
  });
  styleInputs.fontScale = fontScale.input;
  styleInputs.fontScaleText = fontScale.readout;
  frag.appendChild(fontScale.row);

  const opacity = rangeRow({
    id: 'opacity',
    label: 'Opacity',
    min: 0.2,
    max: 1,
    step: 0.05,
    value: state.hud.opacity,
    format: (value) => `${Math.round(value * 100)}%`,
    onInput(value) {
      state.hud.opacity = value;
      renderCanvas();
    },
  });
  styleInputs.opacity = opacity.input;
  styleInputs.opacityText = opacity.readout;
  frag.appendChild(opacity.row);

  const position = positionRow();
  styleInputs.position = position.readout;
  frag.appendChild(position.row);

  els.groupStyle.appendChild(frag);
}

function segmentedRow(id, label, options, value, onPick) {
  const row = document.createElement('div');
  row.className = 'row row-stack';
  row.dataset.id = id;

  const name = document.createElement('span');
  name.className = 'row-label';
  name.textContent = label;

  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);

  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seg';
    button.dataset.value = option.value;
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(option.value === value));
    button.addEventListener('click', () => {
      paintSegmented(group, option.value);
      onPick(option.value);
    });
    group.appendChild(button);
  }

  row.append(name, group);
  return { row, group };
}

function rangeRow({ id, label, min, max, step, value, format, onInput }) {
  const row = document.createElement('div');
  row.className = 'row row-stack';
  row.dataset.id = id;

  const head = document.createElement('div');
  head.className = 'row-head';

  const name = document.createElement('label');
  name.className = 'row-label';
  name.htmlFor = `style-${id}`;
  name.textContent = label;

  const readout = document.createElement('span');
  readout.className = 'row-value';
  readout.textContent = format(value);

  head.append(name, readout);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'range';
  input.id = `style-${id}`;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const next = Number(input.value);
    readout.textContent = format(next);
    onInput(next);
  });

  row.append(head, input);
  return { row, input, readout };
}

function accentRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = 'accent';

  const name = document.createElement('label');
  name.className = 'row-label';
  name.htmlFor = 'style-accent';
  name.textContent = 'Accent';

  const readout = document.createElement('span');
  readout.className = 'row-value';
  readout.textContent = state.hud.accent;

  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'color-input';
  input.id = 'style-accent';
  input.value = state.hud.accent;
  input.addEventListener('input', () => {
    state.hud.accent = input.value;
    readout.textContent = input.value;
    renderCanvas();
  });

  row.append(name, readout, input);
  return { row, input, readout };
}

function positionRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = 'position';

  const name = document.createElement('span');
  name.className = 'row-label';
  name.textContent = 'Position';

  const readout = document.createElement('span');
  readout.className = 'row-value';
  readout.textContent = positionText();

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'row-action';
  reset.textContent = 'Reset';
  reset.setAttribute('aria-label', 'Reset the plate to the preset position');
  reset.addEventListener('click', resetHudPosition);

  row.append(name, readout, reset);
  return { row, readout };
}

function positionText() {
  return `${Math.round(state.hud.x * 100)}% · ${Math.round(state.hud.y * 100)}%`;
}

function setPreset(id) {
  if (!HUD_PRESETS.includes(id)) return;

  const defaults = presetDefaults(id);

  state.hud.preset = defaults.preset;
  state.hud.align = defaults.align;
  state.hud.fontScale = defaults.fontScale;

  // Each preset carries a default position, but a place the user chose is
  // theirs: a moved plate keeps its normalised centre across the switch.
  if (!state.hud.moved) {
    state.hud.x = defaults.x;
    state.hud.y = defaults.y;
  }

  clampHudPosition();
  syncStyleControls();
  renderCanvas();
}

function setTone(tone) {
  state.hud.tone = tone === 'light' ? 'light' : 'dark';
  renderCanvas();
}

function resetHudPosition() {
  const defaults = presetDefaults(state.hud.preset);
  state.hud.x = defaults.x;
  state.hud.y = defaults.y;
  state.hud.fontScale = defaults.fontScale;
  state.hud.align = defaults.align;
  state.hud.moved = false;
  clampHudPosition();
  syncStyleControls();
  renderCanvas();
}

function syncStyleControls() {
  paintSegmented(styleInputs.preset, state.hud.preset);
  paintSegmented(styleInputs.tone, state.hud.tone);

  if (styleInputs.accent) styleInputs.accent.value = state.hud.accent;
  if (styleInputs.accentText) {
    styleInputs.accentText.textContent = state.hud.accent;
  }
  if (styleInputs.fontScale) {
    styleInputs.fontScale.value = String(state.hud.fontScale);
  }
  if (styleInputs.fontScaleText) {
    styleInputs.fontScaleText.textContent = `${state.hud.fontScale.toFixed(2)}x`;
  }
  if (styleInputs.opacity) styleInputs.opacity.value = String(state.hud.opacity);
  if (styleInputs.opacityText) {
    styleInputs.opacityText.textContent = `${Math.round(state.hud.opacity * 100)}%`;
  }
  updatePositionReadout();
}

function paintSegmented(group, value) {
  if (!group) return;
  for (const button of group.querySelectorAll('.seg')) {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.value === value)
    );
  }
}

function updatePositionReadout() {
  if (!styleInputs.position) return;
  styleInputs.position.textContent = positionText();
}

function clampHudPosition() {
  if (!imageBitmap) return;
  const layout = layoutHUD(ctx, imageBitmap, state.fields, state.hud);
  if (!layout) return;
  state.hud.x = layout.config.x;
  state.hud.y = layout.config.y;
}

function showSource(field, anchor) {
  closeSource();

  const popover = document.createElement('div');
  popover.className = 'popover source-popover';

  const title = document.createElement('p');
  title.className = 'popover-title';
  title.textContent = field.label;

  const value = document.createElement('p');
  value.className = 'popover-value';
  value.textContent = field.available
    ? field.value ?? ''
    : field.reason ?? 'Unavailable';

  const note = document.createElement('p');
  note.className = 'popover-note';
  note.textContent = fieldSource(field, state.exif);

  popover.append(title, value, note);
  document.body.append(popover);

  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const left = Math.max(
    12,
    Math.min(rect.left - width + 36, window.innerWidth - width - 12)
  );
  const top = Math.max(
    12,
    Math.min(rect.bottom + 8, window.innerHeight - height - 12)
  );
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  sourcePopover = popover;
}

function closeSource() {
  if (!sourcePopover) return;
  sourcePopover.remove();
  sourcePopover = null;
}

function onToggle(id, checked) {
  const field = state.fields.find((f) => f.id === id);
  if (!field || field.group === 'style') return;

  field.enabled = checked;
  if (checked) {
    if (!state.hud.fields.includes(id)) state.hud.fields.push(id);
  } else {
    state.hud.fields = state.hud.fields.filter((x) => x !== id);
  }

  renderCanvas();
}

// ---- canvas ----

function renderCanvas() {
  if (!imageBitmap) {
    els.canvas.style.display = 'none';
    els.stageEmpty.hidden = false;
    els.canvas.classList.remove('has-plate');
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

  // The HUD renderer is the only thing that draws over the photo. It reads the
  // registry, so toggles and presets need no drawing code here.
  const layout = renderHUD(ctx, imageBitmap, state.fields, state.hud);
  els.canvas.classList.toggle('has-plate', Boolean(layout));

  // Store the clamped fractions the renderer used, so a tighter preset or a
  // smaller frame can never leave the config pointing outside the photo.
  if (layout) {
    state.hud.x = layout.config.x;
    state.hud.y = layout.config.y;
  }
  updatePositionReadout();
}

// ---- plate drag and keyboard nudge ----

els.canvas.addEventListener('pointerdown', onPointerDown);
els.canvas.addEventListener('pointermove', onPointerMove);
els.canvas.addEventListener('pointerup', endDrag);
els.canvas.addEventListener('pointercancel', endDrag);
els.canvas.addEventListener('keydown', onCanvasKeyDown);

function onPointerDown(event) {
  if (!imageBitmap || event.button !== 0) return;

  const layout = layoutHUD(ctx, imageBitmap, state.fields, state.hud);
  if (!layout) return;

  const point = canvasPoint(event);
  const grace = layout.unit * 0.4;
  const rect = layout.rect;
  const inside =
    point.x >= rect.x - grace &&
    point.x <= rect.x + rect.w + grace &&
    point.y >= rect.y - grace &&
    point.y <= rect.y + rect.h + grace;
  if (!inside) return;

  drag.active = true;
  drag.pointerId = event.pointerId;
  drag.grabX = point.x - rect.x;
  drag.grabY = point.y - rect.y;
  drag.width = rect.w;
  drag.height = rect.h;

  els.canvas.setPointerCapture(event.pointerId);
  els.canvas.classList.add('is-dragging');
  els.canvas.focus({ preventScroll: true });
  event.preventDefault();
}

function onPointerMove(event) {
  if (!drag.active || event.pointerId !== drag.pointerId) return;

  const point = canvasPoint(event);
  const frameW = els.canvas.width;
  const frameH = els.canvas.height;

  let box = {
    x: point.x - drag.grabX,
    y: point.y - drag.grabY,
    w: drag.width,
    h: drag.height,
  };

  // Snap inside 24 screen pixels, measured in frame pixels.
  box = snapBox(box, frameW, frameH, SNAP_SCREEN_PX * point.scale);
  box.x = clamp(box.x, 0, Math.max(0, frameW - box.w));
  box.y = clamp(box.y, 0, Math.max(0, frameH - box.h));

  // The config stores the plate centre as a fraction of the frame, never
  // pixels, so a resize keeps the plate in the same relative place.
  state.hud.x = (box.x + box.w / 2) / frameW;
  state.hud.y = (box.y + box.h / 2) / frameH;
  state.hud.moved = true;

  renderCanvas();
  event.preventDefault();
}

function endDrag(event) {
  if (!drag.active) return;
  drag.active = false;
  drag.pointerId = null;
  els.canvas.classList.remove('is-dragging');
  if (
    event.pointerId != null &&
    els.canvas.hasPointerCapture &&
    els.canvas.hasPointerCapture(event.pointerId)
  ) {
    els.canvas.releasePointerCapture(event.pointerId);
  }
  renderCanvas();
}

function onCanvasKeyDown(event) {
  if (!imageBitmap) return;

  const step = event.shiftKey ? 0.05 : 0.01;
  let dx = 0;
  let dy = 0;
  if (event.key === 'ArrowLeft') dx = -step;
  else if (event.key === 'ArrowRight') dx = step;
  else if (event.key === 'ArrowUp') dy = -step;
  else if (event.key === 'ArrowDown') dy = step;
  else return;

  const layout = layoutHUD(ctx, imageBitmap, state.fields, {
    ...state.hud,
    x: state.hud.x + dx,
    y: state.hud.y + dy,
  });
  if (!layout) return;

  state.hud.x = layout.config.x;
  state.hud.y = layout.config.y;
  state.hud.moved = true;
  renderCanvas();
  event.preventDefault();
}

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const scale = rect.width > 0 ? els.canvas.width / rect.width : 1;
  return {
    x: (event.clientX - rect.left) * scale,
    y: (event.clientY - rect.top) * scale,
    scale,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
        x: state.hud.x,
        y: state.hud.y,
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

// The snapshot from PLAN.md section 4, saved with the gallery so a share page
// renders without querying the network again.
function contextSnapshot() {
  const c = context || emptyContext();
  return {
    place: c.place,
    weather: c.weather,
    elevation: c.elevation,
    peaks: c.peaks ?? [],
    sun: c.sun,
    moon: c.moon,
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
  if (
    sourcePopover &&
    !sourcePopover.contains(event.target) &&
    !event.target.closest('.row-info')
  ) {
    closeSource();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeShare();
    closeSource();
  }
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
