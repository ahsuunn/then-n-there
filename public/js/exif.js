// exifr wrapper. Returns the EXIF contract from PLAN.md section 4 with nulls
// for anything missing, and never throws: every failure resolves to an
// empty contract so a corrupt or metadata-free file still loads its pixels.
//
// exifr is a single pinned ES module loaded lazily from a CDN, so a dropped
// file parses without a build step and without blocking first paint.

const EXIFR_URL = 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs';

let exifrPromise = null;

function loadExifr() {
  if (!exifrPromise) {
    exifrPromise = import(EXIFR_URL).then((mod) => mod.parse);
  }
  return exifrPromise;
}

export function emptyExif() {
  return {
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
    error: null,
  };
}

export async function parseExif(file) {
  const result = emptyExif();
  try {
    const parse = await loadExifr();
    const data = await parse(file, {
      gps: true,
      exif: true,
      reviveValues: false,
    });
    applyTags(result, data);
  } catch (err) {
    result.error = 'could not read EXIF';
  }
  return result;
}

function applyTags(out, data) {
  if (!data || typeof data !== 'object') return;

  out.latitude = num(data.latitude);
  out.longitude = num(data.longitude);
  out.altitude = num(data.altitude) ?? num(data.GPSAltitude);
  out.bearing = num(data.GPSImgDirection) ?? num(data.GPSImgDirectionRef);
  out.focalLength = num(data.FocalLength) ?? num(data.FocalLengthIn35mmFormat);
  out.fNumber = num(data.FNumber) ?? num(data.ApertureValue);
  out.exposureTime = num(data.ExposureTime);
  out.iso = num(data.ISO) ?? num(data.PhotographicSensitivity);
  out.make = str(data.Make);
  out.model = str(data.Model);
  out.width =
    num(data.ImageWidth) ??
    num(data.ExifImageWidth) ??
    num(data.PixelXDimension);
  out.height =
    num(data.ImageHeight) ??
    num(data.ExifImageHeight) ??
    num(data.PixelYDimension);

  const datetime =
    str(data.DateTimeOriginal) ||
    str(data.CreateDate) ||
    str(data.DateTimeDigitized);
  const offset =
    str(data.OffsetTimeOriginal) ||
    str(data.OffsetTime) ||
    str(data.OffsetTimeDigitized);

  out.capturedAt = formatCapturedAt(datetime);
  out.offset = normalizeOffset(offset);
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

// "2024:05:01 12:30:00" -> "2024-05-01T12:30:00". Kept as the local wall
// clock; the UTC offset travels separately in `offset`.
function formatCapturedAt(datetime) {
  if (!datetime) return null;
  if (datetime instanceof Date && !Number.isNaN(datetime.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return (
      `${datetime.getFullYear()}-${p(datetime.getMonth() + 1)}-${p(datetime.getDate())}` +
      `T${p(datetime.getHours())}:${p(datetime.getMinutes())}:${p(datetime.getSeconds())}`
    );
  }
  const m = /^(\d{4})[:/-](\d{2})[:/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
    String(datetime)
  );
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

// "+09:00", "+0900" -> "+09:00". Anything else -> null.
function normalizeOffset(offset) {
  if (!offset) return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(offset).trim());
  if (!m) return null;
  return `${m[1]}${m[2]}:${m[3]}`;
}
