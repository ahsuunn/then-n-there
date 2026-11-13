// Field registry builder. The single source of truth for sidebar rows and HUD
// content. Takes the EXIF contract and returns one entry per displayable field
// in SOURCE + DERIVED groups. The sidebar and the placeholder plate both read
// this list; neither hardcodes a field name.

export function buildFields(exif) {
  return [...sourceFields(exif), ...derivedFields()];
}

function sourceFields(exif) {
  const e = exif || {};
  const hasGps = e.latitude != null && e.longitude != null;

  return [
    {
      id: 'time',
      group: 'source',
      label: 'Captured',
      value: formatTime(e.capturedAt, e.offset),
      format: 'clock',
      available: e.capturedAt != null,
      reason: e.capturedAt == null ? 'no timestamp in this file' : null,
      enabled: true,
    },
    {
      id: 'camera',
      group: 'source',
      label: 'Camera',
      value: formatCamera(e.make, e.model),
      format: 'camera',
      available: e.make != null || e.model != null,
      reason: e.make == null && e.model == null ? 'no camera metadata' : null,
      enabled: true,
    },
    {
      id: 'aperture',
      group: 'source',
      label: 'Aperture',
      value: e.fNumber != null ? `f/${fmtNum(e.fNumber, 1)}` : null,
      format: 'aperture',
      available: e.fNumber != null,
      reason: e.fNumber == null ? 'no aperture in this file' : null,
      enabled: false,
    },
    {
      id: 'shutter',
      group: 'source',
      label: 'Shutter',
      value: formatShutter(e.exposureTime),
      format: 'shutter',
      available: e.exposureTime != null,
      reason: e.exposureTime == null ? 'no shutter speed' : null,
      enabled: false,
    },
    {
      id: 'iso',
      group: 'source',
      label: 'ISO',
      value: e.iso != null ? String(Math.round(e.iso)) : null,
      format: 'iso',
      available: e.iso != null,
      reason: e.iso == null ? 'no ISO' : null,
      enabled: false,
    },
    {
      id: 'bearing',
      group: 'source',
      label: 'Bearing',
      value: e.bearing != null ? `${Math.round(e.bearing)}\u00b0` : null,
      format: 'bearing',
      available: e.bearing != null,
      reason: e.bearing == null ? 'no GPS in this file' : null,
      enabled: false,
    },
    {
      id: 'altitude',
      group: 'source',
      label: 'Altitude',
      value: e.altitude != null ? `${Math.round(e.altitude)} m` : null,
      format: 'metres',
      available: e.altitude != null,
      reason: e.altitude == null ? 'no GPS in this file' : null,
      enabled: false,
    },
    {
      id: 'coordinates',
      group: 'source',
      label: 'Coordinates',
      value:
        hasGps ? `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}` : null,
      format: 'coords',
      available: hasGps,
      reason: !hasGps ? 'no GPS in this file' : null,
      enabled: true,
    },
  ];
}

function derivedFields() {
  const specs = [
    ['place', 'Place', 'place'],
    ['weather', 'Weather', 'temp'],
    ['elevation', 'Elevation', 'metres'],
    ['peaks', 'Peaks', 'peaks'],
    ['sun', 'Sun', 'sun'],
  ];
  return specs.map(([id, label, format]) => ({
    id,
    group: 'derived',
    label,
    value: null,
    format,
    available: false,
    reason: 'resolves in phase 3',
    enabled: false,
  }));
}

// ---- value formatting (kept here so sidebar and HUD agree) ----

function formatTime(capturedAt, offset) {
  if (!capturedAt) return null;
  const wall = capturedAt.replace('T', ' ');
  return offset ? `${wall} ${offset}` : wall;
}

function formatCamera(make, model) {
  const parts = [make, model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function formatShutter(seconds) {
  if (seconds == null) return null;
  if (seconds >= 1) return `${fmtNum(seconds, 1)} s`;
  const denom = Math.round(1 / seconds);
  return `1/${denom} s`;
}

function fmtNum(value, maxDecimals) {
  const factor = 10 ** maxDecimals;
  return String(Math.round(value * factor) / factor);
}
