// One app state object shared across the editor. Mutations go through set() so
// subscribers (the sidebar and the canvas) stay in step without hardcoding a
// field list anywhere.

import { presetDefaults } from './hud.js';

export const state = {
  image: null, // { file, width, height } once a photo is loaded
  exif: null, // EXIF contract from js/exif.js
  fields: [], // field registry from js/fields.js
  // HUD config from PLAN.md section 4. x and y are normalised fractions of the
  // frame, never pixels, so the plate keeps its place at any size. `moved` is
  // editor-only: it records that the user chose a position, so a preset switch
  // knows whether to apply its own default position.
  hud: {
    ...presetDefaults('plate'),
    tone: 'dark',
    accent: '#f0a75c',
    opacity: 1,
    radiusScale: 1,
    plateFont: 'mono',
    moved: false,
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
