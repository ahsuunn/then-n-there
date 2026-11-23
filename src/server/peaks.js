// Overpass proxy. The public instances answer 502 whenever their worker pool is
// full, and only one of the four sends CORS headers, so the browser cannot call
// them reliably. The server does the call instead, rotates mirrors, and caches
// the answer for a day so a demo survives an overloaded instance.

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const USER_AGENT = 'then-n-there/0.1 (student project)';
const TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [1000];

const cache = new Map();

export async function peaksAt(latitude, longitude, radiusM) {
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${radiusM}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ...hit.data, cached: true };
  }

  const query =
    '[out:json][timeout:20];' +
    `node["natural"="peak"](around:${radiusM},${latitude},${longitude});` +
    'out body 50;';

  let lastError = null;

  for (let round = 0; round <= RETRY_DELAYS_MS.length; round++) {
    for (const mirror of MIRRORS) {
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!res.ok) {
          lastError = new Error(`${mirror} answered ${res.status}`);
          continue;
        }

        const data = await res.json();
        cache.set(key, { at: Date.now(), data });
        return { ...data, cached: false };
      } catch (err) {
        lastError = err;
      }
    }

    const delay = RETRY_DELAYS_MS[round];
    if (delay == null) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError ?? new Error('overpass unavailable');
}
