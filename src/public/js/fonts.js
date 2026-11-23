// Font readiness. `document.fonts.ready` alone can resolve before a face has
// been requested, so the loader names the faces and probes each with text that
// lives in it. A face that never arrives resolves to the fallback stack rather
// than hanging a paint or an export.

import { HUD_FAMILIES } from './hud.js';

export async function hudFontsReady() {
  const fonts = typeof document === 'undefined' ? null : document.fonts;
  if (!fonts) return;

  const probes = [
    [`500 16px "${HUD_FAMILIES.sans}"`, 'Aa0123'],
    [`500 16px "${HUD_FAMILIES.mono}"`, 'Aa0123'],
  ];

  try {
    await Promise.all(probes.map(([font, text]) => fonts.load(font, text)));
    await fonts.ready;
  } catch {
    // A missing face still draws in the fallback stack. Never block an export.
  }
}
