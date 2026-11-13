// DOM helpers: escaping, toast, busy states. No framework, no dependencies.

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let toastTimer = null;

export function toast(message, kind = 'info') {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.className = 'toast' + (kind === 'error' ? ' toast--error' : '');
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 3200);
}

export function setBusy(button, busy, busyLabel = 'Working...') {
  if (busy) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.disabled = false;
  }
}
