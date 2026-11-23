// Leaflet map overlay, opened from the coordinates row. One map instance at a
// time. The pin is the photo point; dragging it, or clicking the map when the
// photo has no GPS, reports a new point to the editor, which re-runs the shared
// reverse geocode and repaints the sidebar and the HUD.
//
// Leaflet is loaded from the pinned CDN in index.html, so this module only
// relies on the global L. If that script failed, the overlay still opens and
// says so instead of throwing.

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const PHOTO_ZOOM = 15;
const PICK_ZOOM = 2;
const PIN_PX = 20;

const els = {
  app: document.getElementById('app'),
  overlay: document.getElementById('mapOverlay'),
  panel: document.getElementById('mapPanel'),
  close: document.getElementById('mapClose'),
  canvas: document.getElementById('mapCanvas'),
  coords: document.getElementById('mapCoords'),
  place: document.getElementById('mapPlace'),
  hint: document.getElementById('mapHint'),
  locate: document.getElementById('mapLocate'),
};

let active = null;

export function openMapOverlay({
  latitude = null,
  longitude = null,
  place = null,
  onChange,
  onClose,
} = {}) {
  if (active) {
    active.focus();
    return active;
  }

  const lat = number(latitude);
  const lon = number(longitude);
  const hasPoint = lat != null && lon != null;
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;

  let map = null;
  let marker = null;
  let lookup = 0;
  let closed = false;

  els.overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  if (els.app) els.app.inert = true;

  els.coords.textContent = hasPoint ? formatPoint(lat, lon) : 'no coordinates';
  els.place.textContent =
    place || (hasPoint ? 'place not resolved' : 'no location yet');
  els.place.classList.remove('is-error');
  els.hint.textContent = hasPoint
    ? 'Drag the pin to correct where the photo was taken.'
    : 'Click the map to place the pin, or use your current location.';
  els.locate.disabled = false;
  els.locate.textContent = 'Use my location';

  const L = globalThis.L;
  if (!L) {
    setError('The map library did not load. Check the network and reopen this panel.');
    els.locate.disabled = true;
  } else {
    map = L.map(els.canvas, {
      center: hasPoint ? [lat, lon] : [20, 0],
      zoom: hasPoint ? PHOTO_ZOOM : PICK_ZOOM,
      worldCopyJump: true,
    });
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTRIBUTION,
    }).addTo(map);

    map.on('click', (event) => {
      applyPoint(event.latlng.lat, event.latlng.lng);
    });

    if (hasPoint) ensureMarker(L.latLng(lat, lon));
  }

  function ensureMarker(latlng) {
    if (marker) {
      marker.setLatLng(latlng);
      return marker;
    }

    marker = L.marker(latlng, {
      draggable: true,
      keyboard: true,
      title: 'Photo location',
      alt: 'Photo location',
      icon: L.divIcon({
        className: 'map-pin-wrap',
        html: '<span class="map-pin"></span>',
        iconSize: [PIN_PX, PIN_PX],
        iconAnchor: [PIN_PX / 2, PIN_PX / 2],
      }),
    }).addTo(map);

    marker.on('drag', () => {
      const point = marker.getLatLng();
      els.coords.textContent = formatPoint(point.lat, point.lng);
    });

    marker.on('dragend', () => {
      const point = marker.getLatLng();
      applyPoint(point.lat, point.lng);
    });

    return marker;
  }

  async function applyPoint(newLat, newLon) {
    if (closed) return;
    const point = L.latLng(newLat, newLon);
    ensureMarker(point);
    els.coords.textContent = formatPoint(newLat, newLon);
    els.place.classList.remove('is-error');
    els.place.textContent = 'looking up the place';

    const token = ++lookup;
    let text = null;
    try {
      if (typeof onChange === 'function') {
        text = await onChange({ latitude: newLat, longitude: newLon });
      }
    } catch {
      text = null;
    }
    if (closed || token !== lookup) return;
    els.place.textContent = text || 'place not resolved';
  }

  function locate() {
    if (!navigator.geolocation) {
      setError('This browser has no location service. Click the map instead.');
      return;
    }

    els.locate.disabled = true;
    els.locate.textContent = 'Locating';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (closed) return;
        els.locate.disabled = false;
        els.locate.textContent = 'Use my location';
        if (!map) return;
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        map.setView([point.latitude, point.longitude], PHOTO_ZOOM);
        applyPoint(point.latitude, point.longitude);
      },
      (error) => {
        if (closed) return;
        els.locate.disabled = false;
        els.locate.textContent = 'Use my location';
        setError(geolocationMessage(error));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function setError(message) {
    els.place.textContent = message;
    els.place.classList.add('is-error');
  }

  function focusables() {
    const nodes = els.panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter((node) => node.getClientRects().length > 0);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMap();
      return;
    }
    if (event.key !== 'Tab') return;

    const list = focusables();
    if (list.length === 0) {
      event.preventDefault();
      return;
    }

    const first = list[0];
    const last = list[list.length - 1];
    const current = document.activeElement;

    if (!els.panel.contains(current)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function resize() {
    if (map) map.invalidateSize();
  }

  function closeMap() {
    if (closed) return;
    closed = true;
    lookup += 1;

    document.removeEventListener('keydown', onKeyDown);
    els.close.removeEventListener('click', closeMap);
    els.locate.removeEventListener('click', locate);
    window.removeEventListener('resize', resize);

    if (map) {
      map.remove();
      map = null;
    }
    marker = null;

    els.overlay.hidden = true;
    els.place.classList.remove('is-error');
    document.body.style.overflow = previousOverflow;
    if (els.app) els.app.inert = false;
    active = null;

    if (typeof onClose === 'function') onClose();

    const target = previousFocus;
    if (target && target.isConnected && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  }

  document.addEventListener('keydown', onKeyDown);
  els.close.addEventListener('click', closeMap);
  els.locate.addEventListener('click', locate);
  els.overlay.addEventListener('pointerdown', (event) => {
    if (event.target === els.overlay) closeMap();
  });
  window.addEventListener('resize', resize);

  const handle = {
    close: closeMap,
    focus() {
      els.close.focus({ preventScroll: true });
    },
  };
  active = handle;

  requestAnimationFrame(() => {
    if (closed) return;
    if (map) map.invalidateSize();
    els.close.focus({ preventScroll: true });
  });

  return handle;
}

function formatPoint(lat, lon) {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function geolocationMessage(error) {
  const code = error && error.code;
  if (code === 1) {
    return 'Location access was denied. Allow it for this site, then try again.';
  }
  if (code === 2) {
    return 'Your location is not available right now. Click the map instead.';
  }
  if (code === 3) {
    return 'Locating took too long. Try again, or click the map instead.';
  }
  return 'Could not read your location. Click the map instead.';
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
