// One app state object shared across the editor. Mutations go through set() so
// subscribers (the sidebar and the canvas) stay in step without hardcoding a
// field list anywhere.

export const state = {
  image: null, // { file, width, height } once a photo is loaded
  exif: null, // EXIF contract from js/exif.js
  fields: [], // field registry from js/fields.js
  hud: {
    preset: 'plate',
    tone: 'dark',
    accent: '#f0a75c',
    fontScale: 1,
    opacity: 1,
    align: 'left',
    plateVisible: true,
    fields: [],
  },
  listeners: new Set(),

  set(patch) {
    Object.assign(this, patch);
    this.emit();
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  emit() {
    for (const fn of this.listeners) fn(this);
  },
};
