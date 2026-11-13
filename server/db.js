import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.join(__dirname, '..', 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'app.db');

// Create the data and uploads folders on boot if they are missing.
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS galleries (
    slug TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    image_path TEXT NOT NULL,
    image_width INTEGER,
    image_height INTEGER,
    hud_config TEXT NOT NULL,
    context TEXT NOT NULL
  );
`);

export function slugExists(slug) {
  const row = db.prepare('SELECT 1 FROM galleries WHERE slug = ?').get(slug);
  return Boolean(row);
}

export function insertGallery(record) {
  const stmt = db.prepare(`
    INSERT INTO galleries
      (slug, created_at, image_path, image_width, image_height, hud_config, context)
    VALUES
      (@slug, @createdAt, @imagePath, @imageWidth, @imageHeight, @hudConfig, @context)
  `);
  stmt.run({
    slug: record.slug,
    createdAt: record.createdAt,
    imagePath: record.imagePath,
    imageWidth: record.imageWidth ?? null,
    imageHeight: record.imageHeight ?? null,
    hudConfig: JSON.stringify(record.hudConfig),
    context: JSON.stringify(record.context),
  });
  return getGallery(record.slug);
}

export function getGallery(slug) {
  const row = db
    .prepare('SELECT * FROM galleries WHERE slug = ?')
    .get(slug);
  if (!row) return null;
  return rowToRecord(row);
}

function rowToRecord(row) {
  return {
    slug: row.slug,
    createdAt: row.created_at,
    imagePath: row.image_path,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    hudConfig: JSON.parse(row.hud_config),
    context: JSON.parse(row.context),
  };
}

export function closeDb() {
  db.close();
}
