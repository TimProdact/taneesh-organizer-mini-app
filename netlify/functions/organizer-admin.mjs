import { validateInitData } from '../../server/telegram-auth.mjs';
import {
  getSnapshot,
  runAction,
  isOrganizer,
  grantOrganizer,
  initBlobs,
} from '../../server/organizer-store.mjs';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function authUser(body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw Object.assign(new Error('Bot not configured'), { status: 500 });
  const parsed = validateInitData(body.initData, token);
  if (!parsed) throw Object.assign(new Error('Invalid Telegram session'), { status: 401 });
  if (!(await isOrganizer(parsed.user.id))) {
    throw Object.assign(
      new Error(
        'Нет доступа. Открой @taneesh_org_bot и отправь /login <пароль>, либо попроси добавить твой Telegram ID.',
      ),
      { status: 403 },
    );
  }
  return parsed.user;
}

async function handleTelegramUpdate(update) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const password = process.env.ADMIN_PASSWORD || 'TANEESH_ORG';
  const msg = update?.message;
  if (!msg?.text || !msg.from?.id) return;

  const chatId = msg.chat.id;
  const text = String(msg.text).trim();
  const api = `https://api.telegram.org/bot${token}`;

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
        '1) Отправь /login <пароль> чтобы привязать Telegram\n' +
        '2) Открой Mini App кнопкой «Админка» внизу\n\n' +
        'Команды: /start /login /whoami /help',
    );
    return;
  }

  if (text === '/whoami') {
    const ok = await isOrganizer(msg.from.id);
    await reply(`Telegram ID: ${msg.from.id}\nДоступ: ${ok ? 'есть ✅' : 'нет ❌'}`);
    return;
  }

  if (text.startsWith('/login')) {
    const parts = text.split(/\s+/);
    const secret = parts[1] || '';
    if (secret !== password) {
      await reply('Неверный пароль.');
      return;
    }
    await grantOrganizer(msg.from.id);
    await reply(
      `Готово. Telegram ${msg.from.id} привязан к доступу организатора.\nОткрой Mini App кнопкой «Админка».`,
    );
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  initBlobs(event);

  const path = event.path || '';
  const isWebhook =
    path.includes('/telegram/webhook') ||
    path.endsWith('/webhook') ||
    event.queryStringParameters?.telegram === '1';

  try {
    if (event.httpMethod === 'GET' && (path.endsWith('/organizer-admin') || path.endsWith('/'))) {
      return json(200, { ok: true, service: 'taneesh-organizer-api' });
    }

    if (isWebhook && event.httpMethod === 'POST') {
      const update = JSON.parse(event.body || '{}');
      await handleTelegramUpdate(update);
      return json(200, { ok: true });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

    const body = JSON.parse(event.body || '{}');

    if (body.action === 'grant_organizer') {
      const secret = process.env.ADMIN_PASSWORD || 'TANEESH_ORG';
      if (body.secret !== secret) return json(403, { error: 'Forbidden' });
      await grantOrganizer(body.telegramId);
      return json(200, { ok: true });
    }

    const user = await authUser(body);

    if (body.action === 'bootstrap') {
      return json(200, {
        snapshot: getSnapshot(),
        firstName: user.first_name,
        telegramId: user.id,
      });
    }

    if (body.action === 'admin_action') {
      const snapshot = await runAction(body.adminAction, body.payload || {});
      return json(200, { snapshot });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('organizer-admin', e);
    return json(status, { error: e.message || 'Server error' });
  }
}
