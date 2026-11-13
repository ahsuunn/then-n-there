// Small DOM helpers: toasts and button busy states. Dependency-free.

const TOAST_TIMEOUT_MS = 5000;
const EXIT_FALLBACK_MS = 500;

let toastRoot = null;

// Toasts are polite status messages: role=status, a visible close control, and
// a timeout that pauses while the message is hovered or focused. The animation
// is decorative, so reduced motion removes the item immediately.
export function toast(message, type = 'info') {
  const root = getToastRoot();
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss message');
  close.textContent = '\u00d7';

  item.append(text, close);
  root.appendChild(item);

  requestAnimationFrame(() => item.classList.add('toast-in'));

  let timer = 0;
  let removed = false;

  const dismiss = () => {
    if (removed) return;
    removed = true;
    window.clearTimeout(timer);
    item.classList.remove('toast-in');
    item.classList.add('toast-out');

    if (prefersReducedMotion()) {
      item.remove();
      return;
    }

    item.addEventListener('transitionend', () => item.remove(), { once: true });
    // Fallback removal if the transition never fires.
    window.setTimeout(() => item.remove(), EXIT_FALLBACK_MS);
  };

  const startTimer = () => {
    if (removed) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(dismiss, TOAST_TIMEOUT_MS);
  };

  close.addEventListener('click', dismiss);
  item.addEventListener('mouseenter', () => window.clearTimeout(timer));
  item.addEventListener('mouseleave', startTimer);
  item.addEventListener('focusin', () => window.clearTimeout(timer));
  item.addEventListener('focusout', (event) => {
    if (!item.contains(event.relatedTarget)) startTimer();
  });

  startTimer();
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

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function setBusy(button, busy, busyLabel = 'Working') {
  if (!button) return;
  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.textContent = button.dataset.idleLabel || button.textContent;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
