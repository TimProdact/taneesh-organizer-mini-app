/**
 * Local long-polling for @taneesh_yougile_bot (пока Render без YOUGILE_* env).
 * Usage: node server/yougile-bot-local.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleYougileUpdate,
  startYougilePolling,
  yougileBotConfigured,
} from './yougile-bot.mjs';

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

if (!yougileBotConfigured()) {
  console.error('Missing YOUGILE_* in .env');
  process.exit(1);
}

const token = process.env.YOUGILE_TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${token}`;

async function tg(method, body) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

let offset = 0;

async function loop() {
  await tg('deleteWebhook', { drop_pending_updates: false });
  await tg('setMyCommands', {
    commands: [
      { command: 'start', description: 'Меню' },
      { command: 'new', description: 'Новая задача в Inbox' },
      { command: 'sync', description: 'Проверить YouGile сейчас' },
      { command: 'cancel', description: 'Отмена' },
    ],
  });
  console.log('@taneesh_yougile_bot local long-poll started');
  startYougilePolling(60_000);

  for (;;) {
    try {
      const data = await tg('getUpdates', {
        offset,
        timeout: 50,
        allowed_updates: ['message'],
      });
      if (!data.ok) {
        console.error('getUpdates', data);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const upd of data.result || []) {
        offset = upd.update_id + 1;
        try {
          await handleYougileUpdate(upd);
        } catch (e) {
          console.error('handle', e);
        }
      }
    } catch (e) {
      console.error('poll error', e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
