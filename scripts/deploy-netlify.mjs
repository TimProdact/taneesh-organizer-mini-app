#!/usr/bin/env node
/**
 * Deploy organizer Mini App + API to Netlify (public HTTPS).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(ROOT, '.env');
const SITE_NAME = process.env.NETLIFY_SITE_NAME || 'taneesh-organizer-bot';

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

const token = process.env.TELEGRAM_BOT_TOKEN;
const password = process.env.ADMIN_PASSWORD || 'TANEESH_ORG';
const organizerIds = process.env.TELEGRAM_ORGANIZER_IDS || '';

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN не задан');
  process.exit(1);
}

console.log('→ npm install (root + mini-app)');
execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
execSync('npm install', { cwd: join(ROOT, 'mini-app'), stdio: 'inherit' });

console.log('→ build mini-app');
execSync('npm run build:mini-app', { cwd: ROOT, stdio: 'inherit' });

function ntl(args, opts = {}) {
  return execSync(`npx --yes netlify-cli ${args}`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || 'pipe',
    ...opts,
  });
}

// Ensure site exists / linked
let siteId = '';
try {
  const status = ntl('status --json');
  const parsed = JSON.parse(status);
  siteId = parsed?.site?.id || parsed?.siteId || '';
} catch {
  /* not linked */
}

if (!siteId) {
  console.log(`→ Creating / linking Netlify site: ${SITE_NAME}`);
  try {
    ntl(`sites:create --name ${SITE_NAME}`, { stdio: 'inherit' });
  } catch {
    console.log('→ site may already exist, trying link by name…');
  }
  try {
    ntl(`link --name ${SITE_NAME}`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('link warning:', e.message);
  }
}

console.log('→ Setting Netlify env vars');
const envPairs = [
  ['TELEGRAM_BOT_TOKEN', token],
  ['ADMIN_PASSWORD', password],
  ['TELEGRAM_ORGANIZER_IDS', organizerIds],
];
for (const [k, v] of envPairs) {
  try {
    execSync(`npx --yes netlify-cli env:set ${k} ${JSON.stringify(v)}`, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
  } catch (e) {
    console.warn('env:set', k, e.message);
  }
}

console.log('→ netlify deploy --prod');
const deployOut = execSync('npx --yes netlify-cli deploy --prod --json', {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'inherit'],
});

let deploy;
try {
  deploy = JSON.parse(deployOut);
} catch {
  // sometimes CLI prints non-json lines
  const match = deployOut.match(/\{[\s\S]*\}$/);
  deploy = match ? JSON.parse(match[0]) : {};
}

const siteUrl = (deploy.ssl_url || deploy.url || deploy.deploy_url || '').replace(/\/$/, '');
if (!siteUrl) {
  console.error('Не удалось получить URL деплоя. Raw:', deployOut.slice(0, 500));
  process.exit(1);
}

const miniAppUrl = `${siteUrl}/mini-app/`;
const apiUrl = siteUrl;

writeFileSync(join(ROOT, '.deploy-url'), siteUrl);
console.log('→ Site:', siteUrl);
console.log('→ Mini App:', miniAppUrl);
console.log('→ API:', `${apiUrl}/api`);

console.log('→ setup telegram');
execSync(`node scripts/setup-telegram.mjs ${JSON.stringify(miniAppUrl)} ${JSON.stringify(apiUrl)}`, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});

console.log('\nГотово.');
console.log(`1. Открой @taneesh_org_bot`);
console.log(`2. /login ${password}`);
console.log(`3. Кнопка «Админка» → ${miniAppUrl}`);
