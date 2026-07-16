import { writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(ROOT, 'mini-app', 'dist');
const pub = join(ROOT, 'public');
const target = join(pub, 'mini-app');

if (!existsSync(dist)) {
  console.error('mini-app/dist missing — run build first');
  process.exit(1);
}

mkdirSync(pub, { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true });

writeFileSync(
  join(pub, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Taneesh Organizer</title>
<p>Organizer Mini App: <a href="/mini-app/">/mini-app/</a></p>
<p>API: <a href="/api">/api</a></p>`,
);

console.log('→ synced public/mini-app');
