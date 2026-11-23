// EXIF intake. Wraps exifr so the rest of the app never touches exifr's raw
// output shape. Always resolves to the EXIF contract with nulls for anything
// missing, and never throws: a photo without EXIF still renders and exports.

import { parse } from 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs';

const emptyContract = () => ({
  latitude: null,
  longitude: null,
  capturedAt: null,
  offset: null,
  altitude: null,
  bearing: null,
  focalLength: null,
  fNumber: null,
  exposureTime: null,
  iso: null,
  make: null,
  model: null,
  width: null,
  height: null,
});

export async function readExif(file) {
  const out = emptyContract();
  try {
    // reviveValues: false keeps DateTimeOriginal as the raw local wall-clock
    // string, so capturedAt stays faithful to what the camera wrote instead of
    // being shifted into the browser timezone.
    const data = await parse(file, {
      gps: true,
      exif: true,
      ifd0: true,
      translateValues: true,
      reviveValues: false,
    });
    if (!data) return out;

    out.latitude = numOrNull(data.latitude);
    out.longitude = numOrNull(data.longitude);
    out.capturedAt = toIsoLocal(data.DateTimeOriginal);
    out.offset = normalizeOffset(data.OffsetTimeOriginal ?? data.OffsetTime);
    out.altitude = signedAltitude(data.GPSAltitude, data.GPSAltitudeRef);
    out.bearing = numOrNull(data.GPSImgDirection);
    out.focalLength = numOrNull(data.FocalLength);
    out.fNumber = numOrNull(data.FNumber);
    out.exposureTime = numOrNull(data.ExposureTime);
    out.iso = numOrNull(data.ISO);
    out.make = strOrNull(data.Make);
    out.model = strOrNull(data.Model);
    out.width = intOrNull(data.ImageWidth ?? data.ExifImageWidth);
    out.height = intOrNull(data.ImageHeight ?? data.ExifImageHeight);
  } catch {
    // EXIF is optional.
  }
  return out;
}

function numOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function intOrNull(value) {
  const n = numOrNull(value);
  return n === null ? null : Math.round(n);
}

function strOrNull(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// GPSAltitudeRef 1 means below sea level.
function signedAltitude(altitude, ref) {
  const n = numOrNull(altitude);
  if (n === null) return null;
  return ref === 1 ? -n : n;
}

// "2023:05:01 14:30:00" or "2023-05-01 14:30:00" -> "2023-05-01T14:30:00".
function toIsoLocal(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw
    .trim()
    .match(/^(\d{4})[-:](\d{2})[-:](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`;
}

// "+9", "+09:00", "Z" -> "+09:00".
function normalizeOffset(offset) {
  if (typeof offset !== 'string') return null;
  const t = offset.trim();
  if (/^z$/i.test(t)) return '+00:00';
  const m = t.match(/^([+-])(\d{1,2}):?(\d{2})?$/);
  if (!m) return t || null;
  return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
}
