#!/usr/bin/env node
/**
 * Redeploy taneesh-organizer-api on Render + refresh Telegram menu/webhook.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(ROOT, '.env');
const SERVICE_NAME = 'taneesh-organizer-api';
const SITE_URL = 'https://taneesh-organizer-api.onrender.com';

function loadEnv() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

console.log('→ git push (Render auto-deploy on commit)');
try {
  execSync('git push origin HEAD', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.warn('git push skipped / failed — trigger deploy manually if needed');
}

console.log('→ trigger Render deploy');
try {
  const list = execSync('render services list -o json', { cwd: ROOT, encoding: 'utf8' });
  const items = JSON.parse(list);
  let id = '';
  for (const item of items || []) {
    const s = item.service || item;
    if (s?.name === SERVICE_NAME) {
      id = s.id;
      break;
    }
  }
  if (!id) throw new Error(`Service ${SERVICE_NAME} not found`);
  execSync(`render deploys create ${id} --confirm`, { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.warn('Render CLI redeploy:', e.message);
  console.warn('Dashboard:', `https://dashboard.render.com`);
}

const mini = `${SITE_URL}/mini-app/`;
console.log('→ setup telegram menu + webhook');
execSync(`node scripts/setup-telegram.mjs ${JSON.stringify(mini)} ${JSON.stringify(SITE_URL)}`, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});

console.log('\nRender:', SITE_URL);
console.log('Mini App:', mini);
console.log('Bot: @taneesh_org_bot → /login <ADMIN_PASSWORD> → «Админка»');
