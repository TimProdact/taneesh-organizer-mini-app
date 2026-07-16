#!/usr/bin/env node
/**
 * Long-running Organizer Admin API (Render / local).
 * Same auth + webhook as Netlify function.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInitData } from './telegram-auth.mjs';
import {
  getSnapshot,
  runAction,
  isOrganizer,
  grantOrganizer,
} from './organizer-store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8788);

function loadEnv() {
  const envPath = join(ROOT, '.env');
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

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TANEESH_ORG';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
}

function send(res, status, body) {
  cors(res);
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function authUser(body) {
  if (!TOKEN) throw Object.assign(new Error('Bot not configured'), { status: 500 });
  const parsed = validateInitData(body.initData, TOKEN);
  if (!parsed) throw Object.assign(new Error('Invalid Telegram session'), { status: 401 });
  if (!(await isOrganizer(parsed.user.id))) {
    throw Object.assign(
      new Error(
        'Нет доступа. Открой @taneesh_org_bot и отправь /login <пароль>.',
      ),
      { status: 403 },
    );
  }
  return parsed.user;
}

async function handleTelegramUpdate(update) {
  const msg = update?.message;
  if (!msg?.text || !msg.from?.id) return;
  const chatId = msg.chat.id;
  const text = String(msg.text).trim();
  const api = `https://api.telegram.org/bot${TOKEN}`;
  const reply = async (t) => {
    await fetch(`${api}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: t }),
    });
  };

  if (text === '/start' || text === '/help') {
    await reply(
      'Taneesh — кабинет организатора.\n\n' +
        '1) /login <пароль> — привязать Telegram\n' +
        '2) Кнопка «Админка» внизу\n\n' +
        '/whoami — проверить доступ',
    );
    return;
  }
  if (text === '/whoami') {
    const ok = await isOrganizer(msg.from.id);
    await reply(`Telegram ID: ${msg.from.id}\nДоступ: ${ok ? 'есть ✅' : 'нет ❌'}`);
    return;
  }
  if (text.startsWith('/login')) {
    const secret = text.split(/\s+/)[1] || '';
    if (secret !== ADMIN_PASSWORD) {
      await reply('Неверный пароль.');
      return;
    }
    await grantOrganizer(msg.from.id);
    await reply(`Готово. ${msg.from.id} привязан. Открой «Админка».`);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/api')) {
      return send(res, 200, { ok: true, service: 'taneesh-organizer-api' });
    }

    if (url.pathname === '/telegram/webhook' && req.method === 'POST') {
      const update = await readBody(req);
      await handleTelegramUpdate(update);
      return send(res, 200, { ok: true });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

    const body = await readBody(req);

    if (body.action === 'grant_organizer') {
      if (body.secret !== ADMIN_PASSWORD) return send(res, 403, { error: 'Forbidden' });
      await grantOrganizer(body.telegramId);
      return send(res, 200, { ok: true });
    }

    const user = await authUser(body);
    if (body.action === 'bootstrap') {
      return send(res, 200, {
        snapshot: getSnapshot(),
        firstName: user.first_name,
        telegramId: user.id,
      });
    }
    if (body.action === 'admin_action') {
      const snapshot = await runAction(body.adminAction, body.payload || {});
      return send(res, 200, { snapshot });
    }
    return send(res, 400, { error: 'Unknown action' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    send(res, status, { error: e.message || 'Server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`taneesh-organizer-api on :${PORT}`);
});
