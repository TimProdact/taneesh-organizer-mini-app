/**
 * Long-running Organizer Admin API + static Mini App (Render / local).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
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
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

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
}

function sendJson(res, status, body) {
  cors(res);
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function tryStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = join(PUBLIC, rel.replace(/^\/+/, ''));
  if (!filePath.startsWith(PUBLIC) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    if (rel.startsWith('/mini-app')) {
      const index = join(PUBLIC, 'mini-app', 'index.html');
      if (existsSync(index)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(readFileSync(index));
        return true;
      }
    }
    return false;
  }
  res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
  res.writeHead(200);
  res.end(readFileSync(filePath));
  return true;
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
      new Error('Нет доступа. Открой @taneesh_org_bot и отправь /login <пароль>.'),
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

    if (url.pathname === '/telegram/webhook' && req.method === 'POST') {
      const update = await readBody(req);
      await handleTelegramUpdate(update);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && (url.pathname === '/api' || url.pathname === '/health')) {
      return sendJson(res, 200, { ok: true, service: 'taneesh-organizer-api' });
    }

    if (req.method === 'POST' && (url.pathname === '/' || url.pathname === '/api')) {
      const body = await readBody(req);

      if (body.action === 'grant_organizer') {
        if (body.secret !== ADMIN_PASSWORD) return sendJson(res, 403, { error: 'Forbidden' });
        await grantOrganizer(body.telegramId);
        return sendJson(res, 200, { ok: true });
      }

      const user = await authUser(body);
      if (body.action === 'bootstrap') {
        return sendJson(res, 200, {
          snapshot: getSnapshot(),
          firstName: user.first_name,
          telegramId: user.id,
        });
      }
      if (body.action === 'admin_action') {
        const snapshot = await runAction(body.adminAction, body.payload || {});
        return sendJson(res, 200, { snapshot });
      }
      return sendJson(res, 400, { error: 'Unknown action' });
    }

    if (req.method === 'GET' && tryStatic(req, res, url.pathname)) return;

    if (req.method === 'GET' && url.pathname === '/') {
      return sendJson(res, 200, {
        ok: true,
        service: 'taneesh-organizer-api',
        miniApp: '/mini-app/',
      });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    sendJson(res, status, { error: e.message || 'Server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`taneesh-organizer-api on :${PORT}`);
});
