import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSlug } from './slug.js';
import { UPLOADS_DIR, insertGallery, getGallery, slugExists } from './db.js';
import { upload, sniffImage, imageDimensions } from './uploads.js';
import { peaksAt } from './peaks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(publicDir));
app.use('/uploads', express.static(UPLOADS_DIR));

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

  let slug = generateSlug();
  while (slugExists(slug)) {
    slug = generateSlug();
  }

  const ext = type === 'png' ? 'png' : 'jpg';
  const filename = `${slug}.${ext}`;
  const absolutePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(absolutePath, file.buffer);

  const dims = imageDimensions(file.buffer, type);
  const record = {
    slug,
    createdAt: new Date().toISOString(),
    imagePath: `/uploads/${filename}`,
    imageWidth: dims.width,
    imageHeight: dims.height,
    hudConfig,
    context,
  };

  const stored = insertGallery(record);
  return res.status(201).json(stored);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
