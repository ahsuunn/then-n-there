// WMO weather interpretation codes, as used by Open-Meteo. One module so the
// sidebar, the HUD and the share view all print the same words for a code.

const TEXT = new Map([
  [0, 'Clear sky'],
  [1, 'Mainly clear'],
  [2, 'Partly cloudy'],
  [3, 'Overcast'],
  [45, 'Fog'],
  [48, 'Rime fog'],
  [51, 'Light drizzle'],
  [53, 'Drizzle'],
  [55, 'Dense drizzle'],
  [56, 'Freezing drizzle'],
  [57, 'Heavy freezing drizzle'],
  [61, 'Light rain'],
  [63, 'Rain'],
  [65, 'Heavy rain'],
  [66, 'Freezing rain'],
  [67, 'Heavy freezing rain'],
  [71, 'Light snow'],
  [73, 'Snow'],
  [75, 'Heavy snow'],
  [77, 'Snow grains'],
  [80, 'Light showers'],
  [81, 'Showers'],
  [82, 'Violent showers'],
  [85, 'Light snow showers'],
  [86, 'Snow showers'],
  [95, 'Thunderstorm'],
  [96, 'Thunderstorm, hail'],
  [99, 'Severe thunderstorm'],
]);

export function wmoText(code) {
  if (code == null) return null;
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  return TEXT.get(n) ?? null;
}
