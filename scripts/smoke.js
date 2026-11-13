import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const serverPath = path.join(rootDir, 'server', 'index.js');
const PORT = process.env.SMOKE_PORT || '3321';
const BASE = `http://127.0.0.1:${PORT}`;

// 1x1 transparent PNG (magic bytes 89 50 4E 47 0D 0A 1A 0A).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

let server = null;
let done = false;

function finish(code) {
  if (done) return;
  done = true;
  if (server) {
    server.kill();
    server = null;
  }
  setTimeout(() => process.exit(code), 50);
}

function fail(message) {
  console.error(`smoke: ${message}`);
  finish(1);
}

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function run() {
  server = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  if (!(await waitForServer())) {
    return fail('server did not start in time');
  }

  const home = await fetch(`${BASE}/`);
  if (!home.ok) return fail(`GET / returned ${home.status}`);
  console.log(`smoke: GET / -> ${home.status}`);

  const form = new FormData();
  form.append('image', new Blob([PNG], { type: 'image/png' }), 'test.png');
  form.append(
    'payload',
    JSON.stringify({
      hudConfig: { preset: 'plate' },
      context: {
        place: { name: 'Seoul', admin: 'Seoul', country: 'South Korea' },
        capturedAt: '2026-11-13T12:00:00+09:00',
      },
    })
  );

  const uploadRes = await fetch(`${BASE}/api/galleries`, {
    method: 'POST',
    body: form,
  });
  if (uploadRes.status !== 201) {
    return fail(`POST /api/galleries returned ${uploadRes.status}`);
  }
  const record = await uploadRes.json();
  if (!record || !record.slug) {
    return fail('upload response missing slug');
  }
  console.log(`smoke: POST /api/galleries -> 201, slug ${record.slug}`);

  const getRes = await fetch(`${BASE}/api/galleries/${record.slug}`);
  if (getRes.status !== 200) {
    return fail(`GET /api/galleries/${record.slug} returned ${getRes.status}`);
  }
  const fetched = await getRes.json();
  if (!fetched.imagePath) return fail('record missing imagePath');
  console.log(
    `smoke: GET /api/galleries/<slug> -> 200, image ${fetched.imagePath}`
  );

  const imgRes = await fetch(`${BASE}${fetched.imagePath}`);
  if (!imgRes.ok) {
    return fail(`GET ${fetched.imagePath} returned ${imgRes.status}`);
  }

  const shareRes = await fetch(`${BASE}/s/${record.slug}`);
  if (shareRes.status !== 200) {
    return fail(`GET /s/${record.slug} returned ${shareRes.status}`);
  }
  console.log(`smoke: GET /s/<slug> -> ${shareRes.status}`);

  const missingRes = await fetch(`${BASE}/api/galleries/doesnotexist`);
  if (missingRes.status !== 404) {
    return fail(
      `GET unknown slug returned ${missingRes.status} (expected 404)`
    );
  }
  console.log('smoke: GET unknown slug -> 404');

  const badForm = new FormData();
  badForm.append(
    'image',
    new Blob([Buffer.from('not an image')], { type: 'image/png' }),
    'fake.png'
  );
  badForm.append('payload', JSON.stringify({ hudConfig: {}, context: {} }));
  const badRes = await fetch(`${BASE}/api/galleries`, {
    method: 'POST',
    body: badForm,
  });
  if (badRes.status !== 400) {
    return fail(`non-image upload returned ${badRes.status} (expected 400)`);
  }
  console.log('smoke: non-image upload -> 400');

  console.log('smoke: all checks passed');
  finish(0);
}

run().catch((err) => fail(err && err.message ? err.message : String(err)));
