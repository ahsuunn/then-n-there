// Field registry: the single source of truth for the sidebar rows and the HUD
// content. Builds one entry per displayable field from the EXIF contract (and,
// from phase 3 on, the reconstructed context). Neither the sidebar nor the
// canvas hardcodes a field list.

const DERIVED = [
  { id: 'place', label: 'Place', format: 'place' },
  { id: 'weather', label: 'Weather', format: 'temp' },
  { id: 'elevation', label: 'Elevation', format: 'metres' },
  { id: 'peaks', label: 'Peaks', format: 'peaks' },
  { id: 'sun', label: 'Sun', format: 'sun' },
  { id: 'moon', label: 'Moon', format: 'moon' },
];

export function buildFields(exif, hud) {
  const fields = [];

  // SOURCE: the photo's own data.
  if (exif) {
    fields.push(
      source('time', 'Captured', formatClock(exif.capturedAt), 'clock',
        exif.capturedAt != null, 'no timestamp'),
      source('camera', 'Camera', formatCamera(exif), 'text',
        Boolean(exif.make || exif.model), 'no camera info'),
      source('exposure', 'Exposure', formatExposure(exif), 'exposure',
        hasExposure(exif), 'no exposure data'),
      source('bearing', 'Bearing', formatBearing(exif.bearing), 'degrees',
        exif.bearing != null,
        hasCoords(exif) ? 'camera recorded no direction' : 'no GPS in this file'),
      source('altitude', 'Altitude', formatAltitude(exif.altitude), 'metres',
        exif.altitude != null, 'no altitude recorded'),
      source('coordinates', 'Coordinates', formatCoordinates(exif), 'coords',
        hasCoords(exif), 'no GPS in this file')
    );
  }

  // DERIVED: resolved by phase 3 reconstruction. These placeholder rows keep
  // the finished panel shape visible now.
  for (const d of DERIVED) {
    fields.push({
      id: d.id,
      group: 'derived',
      label: d.label,
      value: null,
      format: d.format,
      available: false,
      reason: 'resolves in phase 3',
      enabled: false,
    });
  }

  // STYLE: hud config exposed as toggleable rows.
  fields.push(
    style('preset', 'Preset', hud.plateVisible ? 'Plate' : 'Off', hud.plateVisible),
    style('tone', 'Tone', hud.tone === 'dark' ? 'Dark' : 'Light', hud.tone === 'dark')
  );

  return fields;
}

export function enabledFieldIds(fields) {
  return fields
    .filter((f) => f.group !== 'style' && f.available && f.enabled)
    .map((f) => f.id);
}

function source(id, label, value, format, available, reason) {
  return {
    id,
    group: 'source',
    label,
    value,
    format,
    available,
    reason: available ? null : reason,
    enabled: available,
  };
}

function style(id, label, value, enabled) {
  return {
    id,
    group: 'style',
    label,
    value,
    format: 'text',
    available: true,
    reason: null,
    enabled,
  };
}

function hasCoords(exif) {
  return exif.latitude != null && exif.longitude != null;
}

function hasExposure(exif) {
  return exif.fNumber != null || exif.exposureTime != null || exif.iso != null;
}

function formatClock(capturedAt) {
  if (!capturedAt) return null;
  return capturedAt.replace('T', ' ');
}

function formatCamera(exif) {
  return [exif.make, exif.model].filter(Boolean).join(' ') || null;
}

function formatExposure(exif) {
  const parts = [];
  if (exif.fNumber != null) parts.push(`f/${trimNum(exif.fNumber)}`);
  if (exif.exposureTime != null) parts.push(formatShutter(exif.exposureTime));
  if (exif.iso != null) parts.push(`ISO ${Math.round(exif.iso)}`);
  return parts.length ? parts.join(' · ') : null;
}

function formatShutter(seconds) {
  if (seconds < 1) return `1/${Math.round(1 / seconds)}s`;
  return `${trimNum(seconds)}s`;
}

function formatBearing(bearing) {
  if (bearing == null) return null;
  return `${Math.round(bearing)}° ${compass(bearing)}`;
}

function compass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function formatAltitude(altitude) {
  if (altitude == null) return null;
  return `${trimNum(altitude)} m`;
}

function formatCoordinates(exif) {
  if (!hasCoords(exif)) return null;
  const lat = `${Math.abs(exif.latitude).toFixed(4)}° ${exif.latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(exif.longitude).toFixed(4)}° ${exif.longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

function trimNum(n) {
  return Number(n.toFixed(2)).toString();
}
