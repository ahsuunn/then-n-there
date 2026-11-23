// Reconstruction: four independent lookups over keyless public data, plus a
// local sun and moon calculation. Each lookup is time-boxed, cached in
// localStorage for 24 hours, and resolves to null on failure, so one dead
// source never blocks the others or the editor.
//
// Sun and moon come from SunCalc, pinned to one CDN build and imported as an
// ES module. They are computed, never fetched.

import SunCalc from 'https://cdn.jsdelivr.net/npm/suncalc@1.9.0/+esm';

const TIMEOUT_MS = 15000;
const PEAKS_TIMEOUT_MS = 25000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = 'tnt:reconstruct:v1';
const USER_AGENT = 'then-n-there/0.1 (student project)';

const PEAK_RADIUS_M = 15000;
const PEAK_BEARING_TOLERANCE_DEG = 25;
const PEAK_LIMIT = 3;

// Which derived rows this photo can actually attempt. The editor shows these
// as resolving until their result lands; everything else gets its reason now.
export function pendingFieldIds(exif) {
  if (!exif || !hasCoords(exif)) return [];
  const ids = ['place', 'elevation', 'peaks'];
  if (exif.capturedAt) ids.push('weather', 'sun', 'moon');
  return ids;
}

// Runs every lookup independently. onResult(kind, value) fires as each field
// settles, so the sidebar can repaint one row at a time. The returned object
// is the full context snapshot from PLAN.md section 4.
export async function reconstructContext(exif, { onResult } = {}) {
  const context = {
    place: null,
    weather: null,
    elevation: null,
    peaks: null,
    sun: null,
    moon: null,
  };
  if (!exif) return context;

  const emit = (kind, value) => {
    context[kind] = value;
    if (typeof onResult === 'function') onResult(kind, value);
  };

  const tasks = [];
  if (hasCoords(exif)) {
    tasks.push(lookupPlace(exif).then((value) => emit('place', value)));
    tasks.push(lookupElevation(exif).then((value) => emit('elevation', value)));
    tasks.push(lookupPeaks(exif).then((value) => emit('peaks', value)));
  }
  if (hasCoords(exif) && exif.capturedAt) {
    tasks.push(lookupWeather(exif).then((value) => emit('weather', value)));
  }

  // Local, synchronous, no network call.
  const sky = computeSky(exif);
  emit('sun', sky.sun);
  emit('moon', sky.moon);

  await Promise.allSettled(tasks);
  return context;
}

// ---- lookups ----

async function lookupPlace(exif) {
  try {
    return await cached('place', exif, () =>
      fetchPlace(exif.latitude, exif.longitude)
    );
  } catch {
    return null;
  }
}

// Reusable reverse geocode for the map overlay. It goes through the same
// localStorage cache as the initial lookup, keyed by rounded coordinates and
// the photo hour, so a pin dragged back over the original spot is free and
// each new point is queried once.
export async function reverseGeocode(latitude, longitude, capturedAt = null) {
  const lat = num(latitude);
  const lon = num(longitude);
  if (lat == null || lon == null) return null;
  try {
    return await cached(
      'place',
      { latitude: lat, longitude: lon, capturedAt },
      () => fetchPlace(lat, lon)
    );
  } catch {
    return null;
  }
}

async function fetchPlace(latitude, longitude) {
  const url =
    'https://api.bigdatacloud.net/data/reverse-geocode-client' +
    `?latitude=${latitude}&longitude=${longitude}` +
    '&localityLanguage=en';
  const data = await getJson(url);
  const name = text(data.city) || text(data.locality);
  const admin = text(data.principalSubdivision);
  const country = text(data.countryName);
  if (!name && !admin && !country) return null;
  return { name: name || admin, admin, country };
}

async function lookupWeather(exif) {
  if (!exif.capturedAt) return null;
  try {
    return await cached('weather', exif, async () => {
      const date = exif.capturedAt.slice(0, 10);
      const url =
        'https://archive-api.open-meteo.com/v1/archive' +
        `?latitude=${exif.latitude}&longitude=${exif.longitude}` +
        `&start_date=${date}&end_date=${date}` +
        '&hourly=temperature_2m,weather_code,wind_speed_10m,cloud_cover' +
        '&timezone=auto';
      const data = await getJson(url);
      const hourly = data.hourly;
      if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
        return null;
      }

      // timezone=auto returns local ISO hours for the photo location, so the
      // EXIF wall clock matches the array directly.
      const index = hourIndex(hourly.time, exif.capturedAt);
      if (index < 0) return null;

      const tempC = num(hourly.temperature_2m?.[index]);
      const code = num(hourly.weather_code?.[index]);
      if (tempC == null && code == null) return null;

      return {
        tempC: tempC == null ? null : round(tempC, 1),
        code,
        wind: num(hourly.wind_speed_10m?.[index]),
        cloud: num(hourly.cloud_cover?.[index]),
        time: hourly.time[index],
        timezone: data.timezone || null,
      };
    });
  } catch {
    return null;
  }
}

async function lookupElevation(exif) {
  try {
    return await cached('elevation', exif, async () => {
      const url =
        'https://api.open-meteo.com/v1/elevation' +
        `?latitude=${exif.latitude}&longitude=${exif.longitude}`;
      const data = await getJson(url);
      const value = Array.isArray(data.elevation)
        ? data.elevation[0]
        : data.elevation;
      const metres = num(value);
      return metres == null ? null : round(metres, 1);
    });
  } catch {
    return null;
  }
}

async function lookupPeaks(exif) {
  try {
    return await cached('peaks', exif, async () => {
      // Overpass is the slowest source by far: the proxy may rotate mirrors
      // and retry, so this lookup gets a longer budget than the others.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PEAKS_TIMEOUT_MS);
      try {
        const data = await fetchPeaks(exif, controller.signal);
        const elements = Array.isArray(data.elements) ? data.elements : [];

        let peaks = elements
          .filter((el) => num(el.lat) != null && num(el.lon) != null)
          .map((el) => {
            const tags = el.tags || {};
            const name = text(tags['name:en']) || text(tags.name);
            const { distanceKm, bearingDeg } = distanceAndBearing(
              exif.latitude,
              exif.longitude,
              el.lat,
              el.lon
            );
            return {
              name,
              distanceKm: round(distanceKm, 2),
              bearingDeg: Math.round(bearingDeg),
              elevation: parseElevation(tags.ele),
            };
          })
          .filter((peak) => peak.name);

        // Without a camera direction the photo can still say what is nearby,
        // so skip the filter rather than dropping the field.
        if (exif.bearing != null) {
          peaks = peaks.filter(
            (peak) =>
              angleDelta(peak.bearingDeg, exif.bearing) <=
              PEAK_BEARING_TOLERANCE_DEG
          );
        }

        peaks.sort((a, b) => a.distanceKm - b.distanceKm);
        return peaks.slice(0, PEAK_LIMIT);
      } finally {
        clearTimeout(timer);
      }
    });
  } catch {
    return null;
  }
}

async function fetchPeaks(exif, signal) {
  // Overpass is called through the server: the public instances either lack
  // CORS headers or answer 502 at capacity, and the proxy caches the result.
  const url =
    '/api/peaks' +
    `?lat=${exif.latitude}&lon=${exif.longitude}&radius=${PEAK_RADIUS_M}`;
  return getJson(url, { method: 'GET', signal });
}

function computeSky(exif) {
  if (!hasCoords(exif) || !exif.capturedAt) return { sun: null, moon: null };
  const when = captureDate(exif);
  if (!when) return { sun: null, moon: null };

  try {
    const times = SunCalc.getTimes(when, exif.latitude, exif.longitude);
    const position = SunCalc.getPosition(when, exif.latitude, exif.longitude);
    const sunrise = validDate(times.sunrise);
    const sunset = validDate(times.sunset);

    // SunCalc azimuth is measured from south toward west; report a compass
    // bearing from north instead.
    const solarAzimuth = normaliseDegrees(
      (position.azimuth * 180) / Math.PI + 180
    );

    const golden = isWithinGoldenHour(when, sunrise, sunset);
    const night = sunrise && sunset ? when < sunrise || when > sunset : false;
    const sun = {
      sunrise: sunrise ? localTime(sunrise, exif.offset) : null,
      sunset: sunset ? localTime(sunset, exif.offset) : null,
      solarAzimuth: Math.round(solarAzimuth),
      isGoldenHour: golden,
      // Without a phase the formatter can only say "not golden hour", which
      // labelled a 21:11 photo as daylight. Night is its own state.
      phase: night ? 'night' : golden ? 'golden hour' : 'daylight',
    };

    const moonInfo = SunCalc.getMoonIllumination(when);
    const moon = {
      phase: moonPhase(moonInfo.phase),
      illumination: Math.round(moonInfo.fraction * 100),
    };

    return { sun, moon };
  } catch {
    return { sun: null, moon: null };
  }
}

// ---- cache ----

async function cached(kind, exif, fetcher) {
  const key = cacheKey(kind, exif);
  const hit = readCache(key);
  if (hit !== undefined) return hit;

  const value = await fetcher();
  if (value != null) writeCache(key, value);
  return value;
}

// Rounded coordinates plus the capture hour, as PLAN.md section 3 requires.
function cacheKey(kind, exif) {
  const lat = Number(exif.latitude).toFixed(3);
  const lon = Number(exif.longitude).toFixed(3);
  const hour = exif.capturedAt ? exif.capturedAt.slice(0, 13) : 'nohour';
  return `${CACHE_PREFIX}:${kind}:${lat},${lon}:${hour}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.t !== 'number') return undefined;
    if (Date.now() - entry.t > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return undefined;
    }
    return entry.v;
  } catch {
    return undefined;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // Storage can be full or disabled; the lookup still worked.
  }
}

// ---- request, time, and geometry helpers ----

async function getJson(url, init = {}) {
  const { signal: external, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(rest.headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', forwardAbort);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCoords(exif) {
  return num(exif.latitude) != null && num(exif.longitude) != null;
}

function captureDate(exif) {
  if (!exif.capturedAt) return null;
  const withOffset = exif.offset
    ? new Date(`${exif.capturedAt}${exif.offset}`)
    : new Date(exif.capturedAt);
  return Number.isNaN(withOffset.getTime()) ? null : withOffset;
}

function validDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value
    : null;
}

function isWithinGoldenHour(when, sunrise, sunset) {
  const hour = 60 * 60 * 1000;
  if (sunrise && when >= sunrise && when <= new Date(sunrise.getTime() + hour)) {
    return true;
  }
  if (sunset && when >= new Date(sunset.getTime() - hour) && when <= sunset) {
    return true;
  }
  return false;
}

// Format the SunCalc instant in the photo's own offset, so a Seoul photo reads
// 07:34 no matter where the browser is running. Without an EXIF offset the
// browser timezone is the best available anchor.
function localTime(date, offset) {
  const hasOffset =
    typeof offset === 'string' && /^[+-]\d{2}:?\d{2}$/.test(offset);
  if (!hasOffset) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  const shifted = new Date(date.getTime() + parseOffsetMs(offset));
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseOffsetMs(offset) {
  const match =
    typeof offset === 'string' ? offset.match(/^([+-])(\d{2}):?(\d{2})$/) : null;
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * 60 * 1000;
}

function hourIndex(times, capturedAt) {
  const targetHour = capturedAt.slice(0, 13);
  const exact = times.findIndex(
    (stamp) => typeof stamp === 'string' && stamp.slice(0, 13) === targetHour
  );
  if (exact >= 0) return exact;

  const target = Number(capturedAt.slice(11, 13));
  if (!Number.isFinite(target)) return -1;
  const minutes = Number(capturedAt.slice(14, 16)) || 0;
  const targetHourFloat = target + minutes / 60;

  let best = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < times.length; i++) {
    const stamp = times[i];
    const hour = Number(stamp.slice(11, 13));
    const minute = Number(stamp.slice(14, 16)) || 0;
    if (!Number.isFinite(hour)) continue;
    const delta = Math.abs(hour + minute / 60 - targetHourFloat);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

function distanceAndBearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const a = Number(lat1) * toRad;
  const b = Number(lat2) * toRad;
  const dLat = (Number(lat2) - Number(lat1)) * toRad;
  const dLon = (Number(lon2) - Number(lon1)) * toRad;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a) * Math.cos(b) * Math.sin(dLon / 2) ** 2;
  const distanceKm = 2 * 6371 * Math.asin(Math.sqrt(h));

  const y = Math.sin(dLon) * Math.cos(b);
  const x =
    Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dLon);
  const bearingDeg = normaliseDegrees((Math.atan2(y, x) * 180) / Math.PI);
  return { distanceKm, bearingDeg };
}

function angleDelta(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function normaliseDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function moonPhase(phase) {
  if (phase < 0.03 || phase > 0.97) return 'New moon';
  if (phase < 0.22) return 'Waxing crescent';
  if (phase < 0.28) return 'First quarter';
  if (phase < 0.47) return 'Waxing gibbous';
  if (phase < 0.53) return 'Full moon';
  if (phase < 0.72) return 'Waning gibbous';
  if (phase < 0.78) return 'Last quarter';
  return 'Waning crescent';
}

function parseElevation(raw) {
  if (raw == null) return null;
  const value = parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(value) ? Math.round(value) : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
