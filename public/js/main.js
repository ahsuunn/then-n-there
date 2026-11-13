const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const pickButton = document.getElementById('pickButton');
const statusEl = document.getElementById('status');
const result = document.getElementById('result');
const shareUrlInput = document.getElementById('shareUrl');
const copyButton = document.getElementById('copyButton');
const openLink = document.getElementById('openLink');

const MAX_BYTES = 15 * 1024 * 1024;

function placeholderPayload() {
  return {
    hudConfig: { preset: 'plate', tone: 'dark', fields: ['place', 'time'] },
    context: {},
  };
}

pickButton.addEventListener('click', (event) => {
  event.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) handleFile(file);
});

['dragover', 'dragenter'].forEach((type) =>
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  })
);

['dragleave', 'drop'].forEach((type) =>
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
  })
);

dropZone.addEventListener('drop', (event) => {
  const file =
    event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) handleFile(file);
});

async function handleFile(file) {
  if (file.size > MAX_BYTES) {
    setStatus('That file is too large. The limit is 15 MB.', true);
    return;
  }
  setStatus('Uploading...');
  result.hidden = true;
  try {
    const form = new FormData();
    form.append('image', file);
    form.append('payload', JSON.stringify(placeholderPayload()));
    const res = await fetch('/api/galleries', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.error) || 'Upload failed');
    }
    showResult(data.slug);
    setStatus('');
  } catch (err) {
    setStatus(err.message || 'Upload failed', true);
  }
}

function showResult(slug) {
  const url = new URL(`/s/${slug}`, window.location.origin).href;
  shareUrlInput.value = url;
  openLink.href = url;
  result.hidden = false;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    copyButton.textContent = 'Copied';
    setTimeout(() => {
      copyButton.textContent = 'Copy';
    }, 1500);
  } catch {
    shareUrlInput.select();
    document.execCommand('copy');
  }
});
