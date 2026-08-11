#!/usr/bin/env node
/**
 * Configure @taneesh_org_bot → Mini App + webhook.
 * Usage: node scripts/setup-telegram.mjs [miniAppUrl] [apiUrl]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(ROOT, '.env');

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
const miniAppUrl =
  process.argv[2] ||
  process.env.ORGANIZER_MINI_APP_URL ||
  '';
const apiUrl =
  process.argv[3] ||
  process.env.ORGANIZER_API_URL ||
  '';

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}
if (!miniAppUrl || !apiUrl) {
  console.error('Нужны ORGANIZER_MINI_APP_URL и ORGANIZER_API_URL (или аргументы)');
  process.exit(1);
}

const webhookUrl = `${apiUrl.replace(/\/$/, '')}/telegram/webhook`;
const API = `https://api.telegram.org/bot${token}`;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

const me = await tg('getMe', {});
console.log(`→ Bot @${me.username}`);

await tg('setChatMenuButton', {
  menu_button: {
    type: 'web_app',
    text: 'Админка',
    web_app: { url: miniAppUrl },
  },
});
console.log('→ Menu button: Админка →', miniAppUrl);

await tg('setMyCommands', {
  commands: [
    { command: 'start', description: 'Как открыть кабинет' },
    { command: 'login', description: 'Привязать Telegram: /login пароль' },
    { command: 'whoami', description: 'Мой Telegram ID и доступ' },
    { command: 'help', description: 'Справка' },
  ],
});
console.log('→ Commands set');

await tg('setWebhook', {
  url: webhookUrl,
  allowed_updates: ['message'],
  drop_pending_updates: true,
});
console.log('→ Webhook →', webhookUrl);

// @taneesh_yougile_bot — задачи YouGile
const ygToken = process.env.YOUGILE_TELEGRAM_BOT_TOKEN;
if (ygToken) {
  const ygHook = `${apiUrl.replace(/\/$/, '')}/yougile-bot/webhook`;
  const ygApi = `https://api.telegram.org/bot${ygToken}`;
  const ygRes = await fetch(`${ygApi}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: ygHook,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
  });
  const ygData = await ygRes.json();
  console.log('→ YouGile bot webhook →', ygHook, ygData.ok ? 'ok' : ygData);
  await fetch(`${ygApi}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: 'Меню и структура задачи' },
        { command: 'new', description: 'Новая задача в Sandbox' },
        { command: 'sync', description: 'Проверить YouGile сейчас' },
        { command: 'cancel', description: 'Отмена' },
      ],
    }),
  });
} else {
  console.warn('→ YOUGILE_TELEGRAM_BOT_TOKEN не задан — YouGile-бот пропущен');
}

// Persist URLs into .env
let envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
function upsert(key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(envText)) envText = envText.replace(re, `${key}=${value}`);
  else envText += `\n${key}=${value}\n`;
}
upsert('ORGANIZER_MINI_APP_URL', miniAppUrl);
upsert('ORGANIZER_API_URL', apiUrl);
writeFileSync(envPath, envText);
console.log('→ .env updated with URLs');
