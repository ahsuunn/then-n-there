import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.static(path.join(root, 'public')));

app.listen(port, () => {
  console.log(`then-n-there listening on http://127.0.0.1:${port}`);
});
