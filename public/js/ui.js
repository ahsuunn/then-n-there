// Small DOM helpers: toasts and button busy states. Dependency-free.

let toastRoot = null;

export function toast(message, type = 'info') {
  const root = getToastRoot();
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.setAttribute('role', 'status');
  item.textContent = message;
  root.appendChild(item);

  requestAnimationFrame(() => item.classList.add('toast-in'));
  window.setTimeout(() => {
    item.classList.remove('toast-in');
    item.classList.add('toast-out');
    item.addEventListener('transitionend', () => item.remove(), { once: true });
    // Fallback removal if the transition never fires.
    window.setTimeout(() => item.remove(), 500);
  }, 3200);
}

function getToastRoot() {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toasts';
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRoot);
  }
  return toastRoot;
}

export function setBusy(button, busy, busyLabel = 'Working') {
  if (!button) return;
  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.idleLabel || button.textContent;
    button.disabled = false;
  }
}
