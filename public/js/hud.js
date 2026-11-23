// The single HUD renderer. The editor draws the preview with it and the share
// view will draw the saved export with it, so both surfaces stay identical.
//
// It reads the field registry it is handed and never keeps a field list of its
// own: a field is drawn when the registry marks it available and the config
// lists it. Position lives in the config as normalised fractions of the frame,
// never pixels, so one config lands in the same relative place on a 600px
// preview and on a 3264px export.

const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const DEFAULT_ACCENT = '#f0a75c';

const TONES = {
  dark: {
    scrim: 'rgba(11, 12, 14, 0.74)',
    ink: '#e8eaed',
    muted: '#9aa1ab',
    rule: 'rgba(232, 234, 237, 0.18)',
  },
  light: {
    scrim: 'rgba(255, 255, 255, 0.82)',
    ink: '#14161a',
    muted: '#5f6368',
    rule: 'rgba(20, 22, 26, 0.2)',
  },
};

// A preset changes arrangement, default position and default type scale. The
// enabled field list is not part of a preset: switching preset keeps it.
const PRESETS = {
  plate: {
    align: 'left',
    x: 0.5,
    y: 0.9,
    fontScale: 1,
    arrangement: 'rows',
    rule: 'top',
    radius: 0.55,
    padX: 1.4,
    padY: 0.95,
    labelGap: 1.7,
    colGap: 2.2,
    lineHeight: 1.5,
    columns: (n) => (n > 8 ? 3 : n > 4 ? 2 : 1),
    maxWidth: 0.9,
    maxHeight: 0.6,
  },
  corner: {
    align: 'right',
    x: 0.84,
    y: 0.18,
    fontScale: 0.92,
    arrangement: 'stack',
    rule: 'right',
    radius: 0.45,
    padX: 1.3,
    padY: 1,
    colGap: 1.9,
    labelLine: 0.92,
    valueLine: 1.24,
    rowGap: 0.42,
    columns: (n) => (n > 6 ? 2 : 1),
    maxWidth: 0.66,
    maxHeight: 0.62,
  },
  strip: {
    align: 'center',
    x: 0.5,
    y: 0.94,
    fontScale: 0.86,
    arrangement: 'inline',
    rule: 'top',
    radius: 0.3,
    padX: 1.3,
    padY: 0.7,
    pairGap: 1.6,
    labelValueGap: 0.55,
    lineHeight: 1.5,
    maxWidth: 0.94,
    maxHeight: 0.4,
  },
};

export const HUD_PRESETS = Object.keys(PRESETS);

// The default position and type scale a preset starts from. The config the
// caller stores must stay normalised: these numbers are fractions, not pixels.
export function presetDefaults(preset) {
  const id = PRESETS[preset] ? preset : 'plate';
  const p = PRESETS[id];
  return { preset: id, x: p.x, y: p.y, fontScale: p.fontScale, align: p.align };
}

// The rows the HUD may show, straight from the registry. Style rows are the
// sidebar's controls, not photo data, so they never reach the canvas.
export function hudRows(fields, config = {}) {
  const list = Array.isArray(fields) ? fields : [];
  const enabled = Array.isArray(config.fields) ? new Set(config.fields) : null;

  return list.filter((field) => {
    if (!field || field.group === 'style' || !field.available) return false;
    if (enabled ? !enabled.has(field.id) : !field.enabled) return false;
    return field.value != null && String(field.value).trim() !== '';
  });
}

// Layout only: measures the plate and resolves its clamped normalised position
// without drawing. The editor uses this for hit testing, dragging and nudging.
export function layoutHUD(ctx, image, fields, config = {}) {
  const frame = frameSize(ctx, image);
  const rows = hudRows(fields, config);
  if (frame.w <= 0 || frame.h <= 0 || rows.length === 0) return null;

  const presetId = PRESETS[config.preset] ? config.preset : 'plate';
  const preset = PRESETS[presetId];
  const fontScale = clampNumber(config.fontScale, 0.5, 2.5, preset.fontScale);
  const base = baseUnit(frame) * fontScale;

  // Measure at the base size, then shrink until the plate fits the frame. A
  // long field (coordinates, peaks) can pull a 12 row plate down a size or two.
  let unit = base;
  let metrics = measure(ctx, preset, rows, unit, frame.w * preset.maxWidth);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const limitW = frame.w * preset.maxWidth;
    const limitH = frame.h * preset.maxHeight;
    if (metrics.boxW <= limitW && metrics.boxH <= limitH) break;
    const factor = Math.min(limitW / metrics.boxW, limitH / metrics.boxH);
    if (!(factor < 1) || unit * factor < 6) break;
    unit = Math.max(6, unit * factor);
    metrics = measure(ctx, preset, rows, unit, limitW);
  }

  const { boxW, boxH } = metrics;
  const wide = boxW >= frame.w;
  const tall = boxH >= frame.h;
  const minX = wide ? 0.5 : boxW / (2 * frame.w);
  const maxX = wide ? 0.5 : 1 - minX;
  const minY = tall ? 0.5 : boxH / (2 * frame.h);
  const maxY = tall ? 0.5 : 1 - minY;

  const nx = clampNumber(config.x, minX, maxX, preset.x);
  const ny = clampNumber(config.y, minY, maxY, preset.y);
  const left = clamp(nx * frame.w - boxW / 2, 0, Math.max(0, frame.w - boxW));
  const top = clamp(ny * frame.h - boxH / 2, 0, Math.max(0, frame.h - boxH));

  return {
    preset: presetId,
    align:
      config.align === 'right' || config.align === 'center'
        ? config.align
        : config.align === 'left'
          ? 'left'
          : preset.align,
    tone: config.tone === 'light' ? 'light' : 'dark',
    accent: accentValue(config.accent),
    opacity: clampNumber(config.opacity, 0, 1, 1),
    frame: { w: frame.w, h: frame.h },
    rect: { x: left, y: top, w: boxW, h: boxH },
    unit,
    rows,
    metrics,
    // The position the renderer actually used after clamping. The editor
    // writes it back so the stored config can never sit outside the frame.
    config: {
      x: wide ? 0.5 : (left + boxW / 2) / frame.w,
      y: tall ? 0.5 : (top + boxH / 2) / frame.h,
    },
    bounds: { minX, maxX, minY, maxY },
  };
}

export function renderHUD(ctx, image, fields, config = {}) {
  const layout = layoutHUD(ctx, image, fields, config);
  if (!layout) return null;

  const { rect, unit, align } = layout;
  const preset = PRESETS[layout.preset];
  const palette = TONES[layout.tone];
  const { metrics } = layout;
  const padX = metrics.padX;
  const padY = metrics.padY;

  ctx.save();
  ctx.globalAlpha = layout.opacity;
  ctx.textBaseline = 'middle';

  // Scrim and rule share one plate path, so the rule can never overhang a
  // rounded corner. The clip is scoped: text must not be clipped.
  const radius = unit * preset.radius;
  ctx.fillStyle = palette.scrim;
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fill();

  ctx.save();
  ctx.clip();

  const rule = Math.max(2, Math.round(unit * 0.14));
  ctx.fillStyle = layout.accent;
  if (preset.rule === 'right') {
    ctx.fillRect(rect.x + rect.w - rule, rect.y, rule, rect.h);
  } else {
    ctx.fillRect(rect.x, rect.y, rect.w, rule);
  }

  ctx.restore();

  if (preset.arrangement === 'inline') {
    drawInline(ctx, layout, palette, rect, unit);
  } else if (preset.arrangement === 'stack') {
    drawStack(ctx, layout, palette, rect, padX, padY, align);
  } else {
    drawRows(ctx, layout, palette, rect, padX, padY);
  }

  ctx.restore();
  return layout;
}

// Snap a box to the eight frame anchors: four corners and four edge midpoints.
// Each anchor is paired with the matching handle on the plate, so a corner
// snaps a corner and an edge midpoint snaps an edge midpoint. The threshold is
// in frame pixels; the caller scales it from 24 screen pixels.
export function snapBox(box, frameW, frameH, threshold) {
  if (!(threshold > 0) || !(frameW > 0) || !(frameH > 0)) return box;

  const anchors = [
    { ax: 0, ay: 0, hx: box.x, hy: box.y },
    { ax: 0.5, ay: 0, hx: box.x + box.w / 2, hy: box.y },
    { ax: 1, ay: 0, hx: box.x + box.w, hy: box.y },
    { ax: 0, ay: 0.5, hx: box.x, hy: box.y + box.h / 2 },
    { ax: 1, ay: 0.5, hx: box.x + box.w, hy: box.y + box.h / 2 },
    { ax: 0, ay: 1, hx: box.x, hy: box.y + box.h },
    { ax: 0.5, ay: 1, hx: box.x + box.w / 2, hy: box.y + box.h },
    { ax: 1, ay: 1, hx: box.x + box.w, hy: box.y + box.h },
  ];

  let best = null;
  for (const anchor of anchors) {
    const dx = anchor.ax * frameW - anchor.hx;
    const dy = anchor.ay * frameH - anchor.hy;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { dx, dy, distance };
  }

  if (!best || best.distance > threshold) {
    return { x: box.x, y: box.y, w: box.w, h: box.h };
  }
  return { x: box.x + best.dx, y: box.y + best.dy, w: box.w, h: box.h };
}

// ---- measuring ----

function measure(ctx, preset, rows, unit, maxWidthPx) {
  const labelSize = unit * (preset.arrangement === 'stack' ? 0.72 : 0.84);
  const labelFont = fontString(500, labelSize);
  const valueFont = fontString(500, unit);
  const labels = rows.map((row) => String(row.label ?? '').toUpperCase());
  const values = rows.map((row) => String(row.value ?? ''));

  ctx.font = labelFont;
  const labelWidths = labels.map((text) => ctx.measureText(text).width);
  ctx.font = valueFont;
  const valueWidths = values.map((text) => ctx.measureText(text).width);

  const padX = unit * preset.padX;
  const padY = unit * preset.padY;
  const base = {
    unit,
    labelSize,
    valueSize: unit,
    labelFont,
    valueFont,
    labels,
    values,
    labelWidths,
    valueWidths,
    padX,
    padY,
  };

  if (preset.arrangement === 'inline') {
    const labelValueGap = unit * preset.labelValueGap;
    const pairGap = unit * preset.pairGap;
    const lineHeight = unit * preset.lineHeight;
    const rowGap = unit * 0.55;
    const pairWidths = values.map(
      (_, i) => labelWidths[i] + labelValueGap + valueWidths[i]
    );
    const available = Math.max(0, (maxWidthPx || Infinity) - padX * 2);

    // Few fields stay on one film-strip line. Many fields wrap into tracks
    // rather than shrinking the type into illegibility.
    const lines = [];
    let line = { indices: [], width: 0 };
    for (let i = 0; i < pairWidths.length; i += 1) {
      const extra = line.indices.length ? pairGap : 0;
      if (
        line.indices.length > 0 &&
        line.width + extra + pairWidths[i] > available
      ) {
        lines.push(line);
        line = { indices: [i], width: pairWidths[i] };
      } else {
        line.indices.push(i);
        line.width += extra + pairWidths[i];
      }
    }
    lines.push(line);

    const contentWidth = Math.max(...lines.map((entry) => entry.width));
    const contentHeight =
      lines.length * lineHeight + (lines.length - 1) * rowGap;

    return {
      ...base,
      pairWidths,
      labelValueGap,
      pairGap,
      lines,
      lineHeight,
      rowGap,
      colGap: 0,
      contentWidth,
      contentHeight,
      boxW: contentWidth + padX * 2,
      boxH: contentHeight + padY * 2,
    };
  }

  const counts = splitColumns(rows.length, preset.columns(rows.length));
  const columns = [];
  let contentWidth = 0;
  let maxRows = 0;
  let start = 0;

  if (preset.arrangement === 'stack') {
    const labelLine = unit * preset.labelLine;
    const valueLine = unit * preset.valueLine;
    const rowGap = unit * preset.rowGap;
    const colGap = unit * preset.colGap;

    for (const count of counts) {
      const indices = indicesFrom(start, count);
      start += count;
      let labelWidth = 0;
      let valueWidth = 0;
      for (const i of indices) {
        labelWidth = Math.max(labelWidth, labelWidths[i]);
        valueWidth = Math.max(valueWidth, valueWidths[i]);
      }
      const width = Math.max(labelWidth, valueWidth);
      columns.push({ indices, labelWidth, valueWidth, width });
      contentWidth += width;
      maxRows = Math.max(maxRows, count);
    }
    contentWidth += colGap * (columns.length - 1);

    return {
      ...base,
      columns,
      colGap,
      labelLine,
      valueLine,
      rowGap,
      contentWidth,
      contentHeight: maxRows * (labelLine + valueLine + rowGap) - rowGap,
      boxW: contentWidth + padX * 2,
      boxH: maxRows * (labelLine + valueLine + rowGap) - rowGap + padY * 2,
    };
  }

  // rows: justified label and value pairs, wrapped into columns.
  const labelGap = unit * preset.labelGap;
  const colGap = unit * preset.colGap;
  const lineHeight = unit * preset.lineHeight;

  for (const count of counts) {
    const indices = indicesFrom(start, count);
    start += count;
    let labelWidth = 0;
    let valueWidth = 0;
    for (const i of indices) {
      labelWidth = Math.max(labelWidth, labelWidths[i]);
      valueWidth = Math.max(valueWidth, valueWidths[i]);
    }
    const width = labelWidth + labelGap + valueWidth;
    columns.push({ indices, labelWidth, valueWidth, width });
    contentWidth += width;
    maxRows = Math.max(maxRows, count);
  }
  contentWidth += colGap * (columns.length - 1);

  return {
    ...base,
    columns,
    colGap,
    labelGap,
    lineHeight,
    contentWidth,
    contentHeight: maxRows * lineHeight,
    boxW: contentWidth + padX * 2,
    boxH: maxRows * lineHeight + padY * 2,
  };
}

function splitColumns(total, columns) {
  const count = Math.max(1, Math.min(columns || 1, total));
  const perColumn = Math.ceil(total / count);
  return Array.from({ length: count }, (_, i) =>
    Math.min(perColumn, total - i * perColumn)
  );
}

function indicesFrom(start, count) {
  return Array.from({ length: count }, (_, i) => start + i);
}

// ---- drawing ----

function drawRows(ctx, layout, palette, rect, padX, padY) {
  const { metrics } = layout;
  let cursorX = rect.x + padX;

  for (const column of metrics.columns) {
    let cursorY = rect.y + padY + metrics.lineHeight / 2;
    for (const index of column.indices) {
      ctx.font = metrics.labelFont;
      ctx.fillStyle = palette.muted;
      ctx.textAlign = 'left';
      ctx.fillText(metrics.labels[index], cursorX, cursorY);

      ctx.font = metrics.valueFont;
      ctx.fillStyle = palette.ink;
      ctx.textAlign = 'right';
      ctx.fillText(
        metrics.values[index],
        cursorX + column.width,
        cursorY
      );
      cursorY += metrics.lineHeight;
    }
    cursorX += column.width + metrics.colGap;
  }
}

function drawStack(ctx, layout, palette, rect, padX, padY, align) {
  const { metrics } = layout;
  const textAlign =
    align === 'left' ? 'left' : align === 'center' ? 'center' : 'right';
  let cursorX = rect.x + padX;

  for (const column of metrics.columns) {
    const anchorX =
      align === 'left'
        ? cursorX
        : align === 'center'
          ? cursorX + column.width / 2
          : cursorX + column.width;
    let cursorY = rect.y + padY;

    for (const index of column.indices) {
      ctx.textAlign = textAlign;
      ctx.font = metrics.labelFont;
      ctx.fillStyle = palette.muted;
      ctx.fillText(
        metrics.labels[index],
        anchorX,
        cursorY + metrics.labelLine / 2
      );

      ctx.font = metrics.valueFont;
      ctx.fillStyle = palette.ink;
      ctx.fillText(
        metrics.values[index],
        anchorX,
        cursorY + metrics.labelLine + metrics.valueLine / 2
      );

      cursorY += metrics.labelLine + metrics.valueLine + metrics.rowGap;
    }

    cursorX += column.width + metrics.colGap;
  }
}

function drawInline(ctx, layout, palette, rect, unit) {
  const { metrics } = layout;
  const tickW = Math.max(1, unit * 0.05);
  const tickH = metrics.lineHeight * 0.62;
  let cursorY = rect.y + metrics.padY;

  for (const line of metrics.lines) {
    const centreY = cursorY + metrics.lineHeight / 2;
    let cursorX = rect.x + metrics.padX;

    for (let position = 0; position < line.indices.length; position += 1) {
      const index = line.indices[position];
      if (position > 0) {
        ctx.fillStyle = palette.rule;
        ctx.fillRect(
          cursorX - metrics.pairGap / 2,
          centreY - tickH / 2,
          tickW,
          tickH
        );
      }

      ctx.font = metrics.labelFont;
      ctx.fillStyle = palette.muted;
      ctx.textAlign = 'left';
      ctx.fillText(metrics.labels[index], cursorX, centreY);
      cursorX += metrics.labelWidths[index] + metrics.labelValueGap;

      ctx.font = metrics.valueFont;
      ctx.fillStyle = palette.ink;
      ctx.fillText(metrics.values[index], cursorX, centreY);
      cursorX += metrics.valueWidths[index] + metrics.pairGap;
    }

    cursorY += metrics.lineHeight + metrics.rowGap;
  }
}

// ---- helpers ----

function frameSize(ctx, image) {
  const canvas = ctx && ctx.canvas ? ctx.canvas : {};
  const width = Number(canvas.width) || Number(image && image.width) || 0;
  const height = Number(canvas.height) || Number(image && image.height) || 0;
  return { w: width, h: height };
}

// The type unit is a fraction of the photo, so a preview and a full export
// keep the same proportions. Capped by height for wide panoramas.
function baseUnit(frame) {
  return Math.max(12, Math.min(frame.w * 0.026, frame.h * 0.05));
}

function accentValue(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) {
    return value.trim();
  }
  return DEFAULT_ACCENT;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, n));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fontString(weight, size) {
  return `${weight} ${Math.max(1, Math.round(size))}px ${MONO}`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
