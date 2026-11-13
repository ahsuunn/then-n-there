// One app state object with subscribe(). editor.js mutates it; the field
// registry, HUD config and current image all live here so the editor and the
// placeholder renderer read from a single source of truth.

export function defaultHudConfig() {
  return {
    preset: 'plate',
    tone: 'dark',
    accent: '#f0a75c',
    fontScale: 1,
    opacity: 1,
    fields: ['time', 'camera', 'coordinates'],
    align: 'left',
  };
}

function createState(initial) {
  const listeners = new Set();
  const store = {
    ...initial,
    set(patch) {
      Object.assign(store, patch);
      for (const fn of [...listeners]) fn(store);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return store;
}

export const state = createState({
  file: null,
  objectUrl: null,
  image: null,
  exif: null,
  fields: [],
  hudConfig: defaultHudConfig(),
  sharing: false,
});
