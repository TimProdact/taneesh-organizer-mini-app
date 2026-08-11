#!/usr/bin/env node
/**
 * Set YOUGILE_* (+ optional GROQ_API_KEY / OPENAI) env on Render and redeploy.
 *
 * RENDER_API_KEY from env, .env, or ~/.render/cli.yaml
 *
 * Usage:
 *   node scripts/set-yougile-render-env.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_NAME = 'taneesh-organizer-api';
const SERVICE_HINT_ID = 'srv-d9ccu39kh4rs73ci64f0';
const SITE_URL = 'https://taneesh-organizer-api.onrender.com';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function loadRenderCliKey() {
  const p = join(homedir(), '.render', 'cli.yaml');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*key:\s*(rnd_\S+)/);
    if (m && !process.env.RENDER_API_KEY) process.env.RENDER_API_KEY = m[1];
  }
}

loadEnvFile(join(ROOT, '.env'));
loadEnvFile(join(ROOT, '..', '.env'));
loadRenderCliKey();

const API_KEY = process.env.RENDER_API_KEY;
if (!API_KEY) {
  console.error('RENDER_API_KEY не задан. Сделай: render login');
  process.exit(1);
}

const REQUIRED = [
  'YOUGILE_API_KEY',
  'YOUGILE_COMPANY_ID',
  'YOUGILE_PROJECT_ID',
  'YOUGILE_TELEGRAM_BOT_TOKEN',
  'YOUGILE_TELEGRAM_CHAT_ID',
];

for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`Missing ${k} in .env`);
    process.exit(1);
  }
}

const ENV_PUT = {
  PUBLIC_URL: process.env.PUBLIC_URL || SITE_URL,
  YOUGILE_API_KEY: process.env.YOUGILE_API_KEY,
  YOUGILE_COMPANY_ID: process.env.YOUGILE_COMPANY_ID,
  YOUGILE_PROJECT_ID: process.env.YOUGILE_PROJECT_ID,
  YOUGILE_TELEGRAM_BOT_TOKEN: process.env.YOUGILE_TELEGRAM_BOT_TOKEN,
  YOUGILE_TELEGRAM_CHAT_ID: process.env.YOUGILE_TELEGRAM_CHAT_ID,
  YOUGILE_TELEGRAM_CHAT_ID_PRIVATE:
    process.env.YOUGILE_TELEGRAM_CHAT_ID_PRIVATE ||
    (process.env.TELEGRAM_ORGANIZER_IDS || '').split(/[,\s]+/)[0] ||
    '',
  YOUGILE_NOTIFY_BOARDS: process.env.YOUGILE_NOTIFY_BOARDS || '*',
};

if (process.env.GROQ_API_KEY) {
  ENV_PUT.GROQ_API_KEY = process.env.GROQ_API_KEY;
}
if (process.env.OPENAI_API_KEY) {
  ENV_PUT.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
}
if (process.env.YOUGILE_NOTIFY_THREAD_ID) {
  ENV_PUT.YOUGILE_NOTIFY_THREAD_ID = process.env.YOUGILE_NOTIFY_THREAD_ID;
}

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.render.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    throw new Error(`${method} ${path} → ${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function findService() {
  const list = await api('/services?limit=50');
  const items = Array.isArray(list) ? list : [];
  for (const it of items) {
    const s = it.service || it;
    if (s.id === SERVICE_HINT_ID || s.name === SERVICE_NAME) return s;
  }
  throw new Error(`Service ${SERVICE_NAME} / ${SERVICE_HINT_ID} not found for this API key`);
}

async function upsertEnv(serviceId, key, value) {
  if (!value) {
    console.warn(`skip empty ${key}`);
    return;
  }
  // Render: PUT /services/{serviceId}/env-vars/{envVarKey}
  await api(`/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { value },
  });
  console.log(`→ env ${key} (${value.length} chars)`);
}

async function main() {
  const me = await api('/owners');
  console.log('Render auth ok', Array.isArray(me) ? me.map((o) => o.owner?.email || o.owner?.name || o).slice(0, 3) : me);

  const svc = await findService();
  console.log('Service', svc.id, svc.name);

  for (const [k, v] of Object.entries(ENV_PUT)) {
    await upsertEnv(svc.id, k, v);
  }

  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    console.warn(
      '⚠ GROQ_API_KEY нет — голос на Render не заработает. Бесплатно: https://console.groq.com/keys',
    );
  }

  console.log('→ trigger deploy');
  const deploy = await api(`/services/${svc.id}/deploys`, {
    method: 'POST',
    body: { clearCache: 'clear' },
  });
  const deployId = deploy?.id || deploy?.deploy?.id;
  console.log('Deploy', deployId || deploy);

  // webhook for yougile bot
  const token = process.env.YOUGILE_TELEGRAM_BOT_TOKEN;
  const hook = `${SITE_URL}/yougile-bot/webhook`;
  const wr = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: hook,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
  }).then((r) => r.json());
  console.log('Telegram webhook', hook, wr.ok ? 'ok' : wr);

  console.log('\nЖди ~2–5 мин cold start, потом:');
  console.log(`  curl -s ${SITE_URL}/yougile-bot/health`);
  console.log('И /start у @taneesh_yougile_bot');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
