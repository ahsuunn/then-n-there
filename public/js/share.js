const slug = window.location.pathname.replace(/^\/s\//, '');

const photoEl = document.getElementById('photo');
const imageEl = document.getElementById('image');
const plateEl = document.getElementById('plate');
const statusEl = document.getElementById('status');

async function load() {
  try {
    const res = await fetch(`/api/galleries/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? 'This share link does not exist.'
          : 'Could not load this photo.'
      );
    }
    const record = await res.json();
    render(record);
  } catch (err) {
    statusEl.textContent = err.message || 'Could not load this photo.';
  }
}

function render(record) {
  imageEl.src = record.imagePath;
  imageEl.alt = captionText(record.context);
  plateEl.textContent = captionText(record.context);
  photoEl.hidden = false;
  statusEl.textContent = '';
}

function captionText(context) {
  const place = formatPlace(context && context.place);
  const time =
    (context && (context.capturedAt || context.time || context.datetime)) ||
    null;
  const parts = [place, time].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'no context yet';
}

function formatPlace(place) {
  if (!place) return null;
  if (typeof place === 'string') return place;
  const bits = [place.name, place.admin, place.country].filter(Boolean);
  return bits.length ? bits.join(', ') : null;
}

load();
