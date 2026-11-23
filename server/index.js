import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSlug } from './slug.js';
import {
  UPLOADS_DIR,
  THUMBS_DIR,
  insertGallery,
  getGallery,
  listGalleries,
  deleteGallery,
  findGalleryByFingerprint,
  slugExists,
} from './db.js';
import { upload, sniffImage, imageDimensions } from './uploads.js';
import { peaksAt } from './peaks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_GALLERY_LIMIT = 12;
const MAX_GALLERY_LIMIT = 50;
const THUMB_PREFIX = 'data:image/jpeg;base64,';
const MAX_THUMB_BYTES = 60 * 1024;

app.use(express.static(publicDir));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/thumbs', express.static(THUMBS_DIR));

app.post('/api/galleries', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return next(err);
    handleUpload(req, res);
  });
});

function handleUpload(req, res) {
  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'image is required' });
  }

  const type = sniffImage(file.buffer);
  if (!type) {
    return res.status(400).json({ error: 'image must be a JPEG or PNG file' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.payload ?? '');
  } catch {
    return res.status(400).json({ error: 'payload must be valid JSON' });
  }
  if (!isObject(payload)) {
    return res.status(400).json({ error: 'payload must be a JSON object' });
  }
  const hudConfig = isObject(payload.hudConfig) ? payload.hudConfig : {};
  const context = isObject(payload.context) ? payload.context : {};

  const thumb = decodeThumb(payload.thumb);
  if (thumb.error) {
    return res.status(400).json({ error: thumb.error });
  }

  // Identical content keeps its link. The client hashes the photo bytes and the
  // overlay configuration, so re-sharing an untouched photo answers with the
  // record that already exists instead of writing a second copy.
  const fingerprint = normaliseFingerprint(req.body.fingerprint);
  if (fingerprint) {
    const existing = findGalleryByFingerprint(fingerprint);
    if (existing) return res.status(200).json(existing);
  }

  let slug = generateSlug();
  while (slugExists(slug)) {
    slug = generateSlug();
  }

  const ext = type === 'png' ? 'png' : 'jpg';
  const filename = `${slug}.${ext}`;
  const absolutePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(absolutePath, file.buffer);

  let thumbPath = null;
  if (thumb.buffer) {
    const thumbFilename = `${slug}.jpg`;
    fs.writeFileSync(path.join(THUMBS_DIR, thumbFilename), thumb.buffer);
    thumbPath = `/thumbs/${thumbFilename}`;
  }

  const dims = imageDimensions(file.buffer, type);
  const record = {
    slug,
    createdAt: new Date().toISOString(),
    imagePath: `/uploads/${filename}`,
    thumbPath,
    imageWidth: dims.width,
    imageHeight: dims.height,
    hudConfig,
    context,
    fingerprint,
  };

  const stored = insertGallery(record);
  return res.status(201).json(stored);
}

// A content fingerprint is a lowercase SHA-256 hex digest, produced by the
// editor from the photo bytes and the overlay configuration. Anything else is
// ignored rather than rejected: an older client simply makes a new record.
function normaliseFingerprint(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(value) ? value : null;
}

// The editor sends a 96px JPEG data URL alongside the photo. It is optional,
// because older clients and the smoke suite save without one, but when it is
// present it must be exactly what the Recent list expects: a JPEG under 60 KB
// once decoded. Written next to the image, never inside the database.
function decodeThumb(raw) {
  if (raw == null || raw === '') return { buffer: null };
  if (typeof raw !== 'string' || !raw.startsWith(THUMB_PREFIX)) {
    return { error: 'thumb must be a data:image/jpeg;base64 URL' };
  }

  const encoded = raw.slice(THUMB_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return { error: 'thumb is not valid base64' };
  }

  const buffer = Buffer.from(encoded, 'base64');
  if (sniffImage(buffer) !== 'jpg') {
    return { error: 'thumb must be a JPEG image' };
  }
  if (buffer.length > MAX_THUMB_BYTES) {
    return { error: 'thumb exceeds 60 KB' };
  }

  return { buffer };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

app.get('/api/galleries', (req, res) => {
  const requested = Number(req.query.limit);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.round(requested), 1), MAX_GALLERY_LIMIT)
    : DEFAULT_GALLERY_LIMIT;
  return res.json(listGalleries(limit));
});

app.get('/api/galleries/:slug', (req, res) => {
  const record = getGallery(req.params.slug);
  if (!record) {
    return res.status(404).json({ error: 'gallery not found' });
  }
  return res.json(record);
});

app.get('/s/:slug', (req, res) => {
  res.sendFile(path.join(publicDir, 'share.html'));
});

// Removes a saved gallery and its image and thumbnail files. The slug is
// re-validated here because it is joined onto a filesystem path below.
app.delete('/api/galleries/:slug', (req, res) => {
  const { slug } = req.params;
  if (!/^[0-9A-Za-z]{4,32}$/.test(slug)) {
    return res.status(400).json({ error: 'invalid slug' });
  }

  const removed = deleteGallery(slug);
  if (!removed) {
    return res.status(404).json({ error: 'gallery not found' });
  }

  const filename = path.basename(removed.imagePath);
  fs.rmSync(path.join(UPLOADS_DIR, filename), { force: true });

  if (removed.thumbPath) {
    const thumbFilename = path.basename(removed.thumbPath);
    fs.rmSync(path.join(THUMBS_DIR, thumbFilename), { force: true });
  }

  return res.status(204).end();
});

app.get('/api/peaks', async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const radius = Math.min(
    Math.max(Number(req.query.radius) || 15000, 1000),
    25000
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return res.status(400).json({ error: 'lat and lon must be valid coordinates' });
  }

  try {
    const data = await peaksAt(latitude, longitude, Math.round(radius));
    return res.json(data);
  } catch {
    return res.status(503).json({ error: 'overpass unavailable' });
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'image exceeds 15 MB limit'
        : err.message;
    return res.status(400).json({ error: message });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`then-n-there listening on http://127.0.0.1:${PORT}`);
});
