// Editor wiring: top bar, drop handling, EXIF intake, sidebar rendering, and
// the placeholder plate drawn onto the canvas. The server is untouched; a
// dropped photo is read locally and never navigates away from `/`.

import { state } from './state.js';
import { parseExif } from './exif.js';
import { buildFields } from './fields.js';
import { esc, toast, setBusy } from './ui.js';

const MAX_BYTES = 15 * 1024 * 1024;

const fileInput = document.getElementById('fileInput');
const openButton = document.getElementById('openButton');
const pickButton = document.getElementById('pickButton');
const shareButton = document.getElementById('shareButton');
const canvas = document.getElementById('canvas');
const emptyState = document.getElementById('emptyState');
const sidebar = document.getElementById('sidebar');
const sourceBody = document.getElementById('sourceBody');
const derivedBody = document.getElementById('derivedBody');
const styleBody = document.getElementById('styleBody');
const sharePopover = document.getElementById('sharePopover');
const shareUrlInput = document.getElementById('shareUrl');
const copyButton = document.getElementById('copyButton');
const openLink = document.getElementById('openLink');

const ctx = canvas.getContext('2d');

// ---- file selection ----

openButton.addEventListener('click', () => fileInput.click());
pickButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) handleFile(file);
  fileInput.value = '';
});

// ---- drop anywhere on the window ----

let dragDepth = 0;

window.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  document.body.classList.add('dragging');
});

window.addEventListener('dragover', (event) => {
  event.preventDefault();
});

window.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const file =
    event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) handleFile(file);
});

// ---- intake ----

async function handleFile(file) {
  if (!file) return;
  const looksImage =
    /^image\//.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  if (!looksImage) {
    toast('Choose a JPEG or PNG file.', 'error');
    return;
  }
  if (file.size > MAX_BYTES) {
    toast('That file is too large. The limit is 15 MB.', 'error');
    return;
  }

  setBusy(openButton, true, 'Reading...');
  try {
    const image = await loadImage(file);
    const exif = await parseExif(file);
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.set({
      file,
      objectUrl: image.url,
      image: image.element,
      exif,
      fields: buildFields(exif),
    });
    renderSidebar();
    drawCanvas();
    emptyState.hidden = true;
    shareButton.disabled = false;
  } catch (err) {
    toast('Could not read that file.', 'error');
  } finally {
    setBusy(openButton, false);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ element: img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not an image'));
    };
    img.src = url;
  });
}

// ---- sidebar ----

function renderSidebar() {
  const fields = state.fields;
  const source = fields.filter((f) => f.group === 'source');
  const derived = fields.filter((f) => f.group === 'derived');

  sourceBody.innerHTML = source.length
    ? source.map(rowTemplate).join('')
    : `<p class="group-hint">Drop a photo to read its EXIF.</p>`;

  derivedBody.innerHTML = derived.length
    ? derived.map(rowTemplate).join('')
    : `<p class="group-hint">Load a photo to resolve context.</p>`;

  styleBody.innerHTML = styleTemplate();
}

function rowTemplate(field) {
  const disabled = !field.available;
  const checked = field.available && field.enabled;
  const value = field.available
    ? field.value ?? ''
    : field.reason || 'unavailable';
  return `
    <label class="row${disabled ? ' row--disabled' : ''}" title="${esc(field.reason || '')}">
      <input type="checkbox" class="row-switch" data-field="${esc(field.id)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} />
      <span class="row-label">${esc(field.label)}</span>
      <span class="row-value">${esc(value)}</span>
    </label>`;
}

function styleTemplate() {
  const tone = state.hudConfig.tone || 'dark';
  return `
    <div class="style-row">
      <span class="row-label">Tone</span>
      <div class="seg" role="radiogroup" aria-label="Plate tone">
        <label class="seg-option">
          <input type="radio" name="tone" value="dark"${tone === 'dark' ? ' checked' : ''} />
          <span>Dark</span>
        </label>
        <label class="seg-option">
          <input type="radio" name="tone" value="light"${tone === 'light' ? ' checked' : ''} />
          <span>Light</span>
        </label>
      </div>
    </div>`;
}

sidebar.addEventListener('change', (event) => {
  const target = event.target;
  if (target.classList && target.classList.contains('row-switch')) {
    const field = state.fields.find((f) => f.id === target.dataset.field);
    if (field) {
      field.enabled = target.checked;
      drawCanvas();
    }
  } else if (target.name === 'tone') {
    state.hudConfig.tone = target.value;
    drawCanvas();
  }
});

// ---- canvas ----

function drawCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const backW = Math.round(cssW * dpr);
  const backH = Math.round(cssH * dpr);

  if (canvas.width !== backW) canvas.width = backW;
  if (canvas.height !== backH) canvas.height = backH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const image = state.image;
  if (!image) return;

  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (!iw || !ih) return;

  const scale = Math.min(cssW / iw, cssH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cssW - dw) / 2;
  const dy = (cssH - dh) / 2;

  ctx.drawImage(image, dx, dy, dw, dh);
  drawPlate(dx, dy, dw, dh);
}

// Minimal placeholder plate: mono text with an amber rule, bottom left. The
// real HUD renderer replaces this in phase 5.
function drawPlate(x, y, w, h) {
  const fields = state.fields.filter(
    (f) => f.group === 'source' && f.available && f.enabled
  );
  if (!fields.length) return;

  const pad = 16;
  const lineH = 18;
  const ruleW = 2;

  const tone = state.hudConfig.tone || 'dark';
  const bg = tone === 'dark' ? 'rgba(11, 12, 14, 0.72)' : 'rgba(232, 234, 237, 0.85)';
  const text = tone === 'dark' ? '#e8eaed' : '#0b0c0e';
  const accent = state.hudConfig.accent || '#f0a75c';

  const lines = fields.map((f) => `${f.label.toUpperCase()}  ${f.value}`);

  ctx.font = '13px "Geist Mono", ui-monospace, monospace';
  const maxW = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const bodyH = lines.length * lineH + pad * 2;
  const plateW = maxW + pad * 2;
  const plateH = bodyH + ruleW;

  const px = x + pad;
  const py = y + h - pad - plateH;

  ctx.fillStyle = accent;
  ctx.fillRect(px, py, plateW, ruleW);

  ctx.fillStyle = bg;
  ctx.fillRect(px, py + ruleW, plateW, bodyH);

  ctx.fillStyle = text;
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const ty = py + ruleW + pad + i * lineH + lineH / 2;
    ctx.fillText(line, px + pad, ty);
  });
}

// ---- share ----

shareButton.addEventListener('click', share);

async function share() {
  if (!state.file || state.sharing) return;
  state.sharing = true;
  setBusy(shareButton, true, 'Sharing...');
  try {
    const form = new FormData();
    form.append('image', state.file);
    form.append('payload', JSON.stringify(buildPayload()));
    const res = await fetch('/api/galleries', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.error) || 'Share failed.');
    }
    showPopover(data.slug);
  } catch (err) {
    toast(err.message || 'Share failed.', 'error');
  } finally {
    state.sharing = false;
    setBusy(shareButton, false);
  }
}

function buildPayload() {
  const enabledIds = state.fields
    .filter((f) => f.available && f.enabled)
    .map((f) => f.id);
  const hudConfig = {
    preset: 'plate',
    tone: state.hudConfig.tone || 'dark',
    accent: state.hudConfig.accent || '#f0a75c',
    fontScale: state.hudConfig.fontScale ?? 1,
    opacity: state.hudConfig.opacity ?? 1,
    fields: enabledIds,
    align: 'left',
  };
  return { hudConfig, context: buildContext() };
}

function buildContext() {
  const e = state.exif || {};
  return {
    capturedAt: e.capturedAt ?? null,
    place: null,
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    make: e.make ?? null,
    model: e.model ?? null,
  };
}

function showPopover(slug) {
  const url = new URL(`/s/${slug}`, window.location.origin).href;
  shareUrlInput.value = url;
  openLink.href = url;
  sharePopover.hidden = false;
}

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    toast('Link copied.');
  } catch {
    shareUrlInput.select();
    document.execCommand('copy');
  }
});

openLink.addEventListener('click', () => {
  sharePopover.hidden = true;
});

document.addEventListener('click', (event) => {
  if (sharePopover.hidden) return;
  if (!sharePopover.contains(event.target) && event.target !== shareButton) {
    sharePopover.hidden = true;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') sharePopover.hidden = true;
});

// ---- resize ----

window.addEventListener('resize', drawCanvas);

// ---- initial paint ----

renderSidebar();
drawCanvas();
