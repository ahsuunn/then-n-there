// Field registry: the single source of truth for the sidebar rows and the HUD
// content. Builds one entry per displayable field from the EXIF contract and
// the reconstructed context. Neither the sidebar nor the canvas hardcodes a
// field list.

import { wmoText } from './wmo.js';

const DERIVED = [
  { id: 'place', label: 'Place', format: 'place' },
  { id: 'weather', label: 'Weather', format: 'temp' },
  { id: 'elevation', label: 'Elevation', format: 'metres' },
  { id: 'peaks', label: 'Peaks', format: 'peaks' },
  { id: 'sun', label: 'Sun', format: 'sun' },
  { id: 'moon', label: 'Moon', format: 'moon' },
];

// Failure text per source. A field that could not be resolved is rendered
// disabled with its reason, never hidden.
const UNAVAILABLE = {
  place: 'reverse geocode unavailable',
  weather: 'no archived weather for that hour',
  elevation: 'elevation lookup unavailable',
  peaks: 'Overpass peaks unavailable',
  sun: 'sun position unavailable',
  moon: 'moon position unavailable',
};

const SOURCE_NOTES = {
  time: 'EXIF DateTimeOriginal, read from the file by exifr',
  camera: 'EXIF Make and Model, read from the file by exifr',
  exposure: 'EXIF aperture, shutter and ISO, read from the file by exifr',
  bearing: 'EXIF GPSImgDirection, read from the file by exifr',
  altitude: 'EXIF GPSAltitude, read from the file by exifr',
  coordinates: 'EXIF GPS latitude and longitude, read by exifr',
  place: 'BigDataCloud reverse geocode client, keyless',
  weather: 'Open-Meteo historical archive API, keyless',
  elevation: 'Open-Meteo elevation API, keyless',
  peaks: 'Overpass API over OpenStreetMap data, keyless',
  sun: 'SunCalc, computed locally from the photo coordinates and time',
  moon: 'SunCalc, computed locally from the photo coordinates and time',
};

export function buildFields(exif, hud, context = null) {
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

  // DERIVED: resolved by phase 3 reconstruction, one independent lookup each.
  for (const def of DERIVED) {
    const value = context ? context[def.id] : null;
    const available = hasDerived(def.id, value);
    fields.push({
      id: def.id,
      group: 'derived',
      label: def.label,
      value: available ? formatDerived(def.id, value) : null,
      format: def.format,
      available,
      reason: available ? null : derivedReason(def.id, exif, value),
      enabled: available,
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

// Where a row's value came from, for the row title and the small i popover.
export function fieldSource(field, exif) {
  if (field.id === 'peaks') {
    if (exif && exif.bearing != null) {
      return (
        'Overpass API over OpenStreetMap data, filtered to the camera ' +
        'direction and ranked by distance'
      );
    }
    return (
      'Overpass API over OpenStreetMap data, ranked by distance. ' +
      'This file has no camera direction, so nearby peaks are not filtered'
    );
  }
  return SOURCE_NOTES[field.id] || 'Computed by the editor';
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

function hasDerived(id, value) {
  switch (id) {
    case 'place':
      return Boolean(value && (value.name || value.admin || value.country));
    case 'weather':
      return Boolean(value && (value.tempC != null || value.code != null));
    case 'elevation':
      return typeof value === 'number' && Number.isFinite(value);
    case 'peaks':
      return Array.isArray(value) && value.length > 0;
    case 'sun':
      return Boolean(
        value &&
          (value.sunrise != null ||
            value.sunset != null ||
            value.solarAzimuth != null)
      );
    case 'moon':
      return Boolean(value && value.phase);
    default:
      return value != null;
  }
}

function derivedReason(id, exif, value) {
  if (!exif) return 'load a photo first';
  if (!hasCoords(exif)) return 'no GPS in this file';
  if (id === 'weather' || id === 'sun' || id === 'moon') {
    if (!exif.capturedAt) return 'no timestamp';
  }
  if (id === 'peaks' && Array.isArray(value)) {
    return 'no named peaks within 15 km';
  }
  return UNAVAILABLE[id] || 'not resolved';
}

function formatDerived(id, value) {
  switch (id) {
    case 'place':
      return formatPlace(value);
    case 'weather':
      return formatWeather(value);
    case 'elevation':
      return `${Math.round(value)} m`;
    case 'peaks':
      return formatPeaks(value);
    case 'sun':
      return formatSun(value);
    case 'moon':
      return `${value.phase} · ${value.illumination}%`;
    default:
      return null;
  }
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

function formatPlace(place) {
  const parts = [];
  if (place.name) parts.push(place.name);
  if (place.country && place.country !== place.name) parts.push(place.country);
  if (parts.length === 0 && place.admin) parts.push(place.admin);
  return parts.join(', ') || null;
}

function formatWeather(weather) {
  const parts = [];
  if (weather.tempC != null) parts.push(`${trimNum(weather.tempC)}°C`);
  const condition = wmoText(weather.code);
  if (condition) parts.push(condition);
  return parts.join(' · ') || null;
}

function formatPeaks(peaks) {
  const first = peaks[0];
  const head = first.name
    ? `${first.name} ${first.distanceKm.toFixed(1)} km`
    : `${first.distanceKm.toFixed(1)} km`;
  const rest = peaks.length - 1;
  return rest > 0 ? `${head} +${rest}` : head;
}

function formatSun(sun) {
  const parts = [sun.isGoldenHour ? 'Golden hour' : 'Daylight'];
  if (sun.solarAzimuth != null) parts.push(`${Math.round(sun.solarAzimuth)}°`);
  return parts.join(' · ');
}

function trimNum(n) {
  return Number(n.toFixed(2)).toString();
}
