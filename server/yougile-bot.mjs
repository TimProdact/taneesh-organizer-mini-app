/**
 * @taneesh_yougile_bot — create YouGile tasks from Telegram + notify group.
 * Webhook: POST /yougile-bot/webhook
 *
 * Env:
 *   YOUGILE_API_KEY, YOUGILE_COMPANY_ID, YOUGILE_PROJECT_ID
 *   YOUGILE_TELEGRAM_BOT_TOKEN
 *   YOUGILE_TELEGRAM_CHAT_ID          — группа: только новые задачи
 *   YOUGILE_TELEGRAM_CHAT_ID_PRIVATE  — личка: переносы / удаления / прочее
 *   GROQ_API_KEY                      — Whisper + разбор структуры (бесплатный облачный tier)
 *   OPENAI_API_KEY                    — запасной вариант (если нет Groq)
 *   YOUGILE_NOTIFY_THREAD_ID          — topic id, если группа-форум (только для group)
 *
 * Исполнитель: когда в задаче появляется assigned (бот или YouGile) —
 * этому человеку в личку бота уходит карточка задачи. Групповые
 * уведомления про новые задачи не меняются.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  createWriteStream,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = join(ROOT, '.yougile-notify-state.json');
const TMP_DIR = join(ROOT, '.yougile-tmp');
const YG_API = 'https://ru.yougile.com/api-v2';
const MARKER = 'tg-bot-created';

const BTN_NEW = '➕ Новая задача';
const BTN_SYNC = '🔄 Проверить YouGile';
const BTN_CANCEL = '❌ Отмена';

const CB_CREATE = 'draft:create';
const CB_CANCEL = 'draft:cancel';
const CB_TASK_DEL_PREFIX = 'task:del:';

/**
 * Короткий гайд в HTML Bot API:
 * <b> <i> <code> <blockquote> — как в клиенте Telegram.
 */
const STRUCTURE_GUIDE =
  '<b>Как писать задачу</b>\n' +
  '<i>Текст или голос — разложу по блокам</i>\n\n' +
  '<blockquote>' +
  '<b>1. Название</b> — одной фразой\n' +
  '<i>Пуши по оплате не приходят в TestFlight</i>\n\n' +
  '<b>2. Тип</b>\n' +
  '<code>Баг</code> · <code>Доработка UI</code> · <code>Новая фича</code> · ' +
  '<code>Инфраструктура</code> · <code>B2B</code> · <code>Релиз</code> · <code>Аналитика</code>\n\n' +
  '<b>3. Контекст</b> — где всплыло\n' +
  '<i>На созвоне, после склейки сборки…</i>\n\n' +
  '<b>4. Как сейчас</b> → <i>сейчас… / не работает…</i>\n' +
  '<b>5. Как надо</b> → <i>надо чтобы… / должно…</i>\n' +
  '<b>6. Технически</b> → <i>на бэке… / в API…</i>\n\n' +
  '<b>7. Приоритет</b>\n' +
  '<code>критично</code> · <code>важно</code> · <code>обычно</code> · <code>низкий</code>\n\n' +
  '<b>8. Исполнитель</b> — в конце\n' +
  '<b>Рашид</b> и/или <b>Рауф</b>\n' +
  '<i>Исполнитель: Рашид</i>' +
  '</blockquote>\n\n' +
  'Дальше: <b>создать</b> или <b>отменить</b>';

/** YouGile user id + Telegram @ + email (+ telegramId когда известен) */
const PEOPLE = [
  {
    key: 'rauf',
    names: ['рауф', 'рауфа', 'рауфу', 'rauf', 'abdurauf'],
    yougileId: 'f2ead94b-0bdf-4fdb-9eea-72987bdc9749',
    email: 'abduraufcoder@gmail.com',
    telegram: '@rauf_cc',
    telegramId: null, // узнаем после /start
    label: 'Рауф',
  },
  {
    key: 'rashid',
    names: ['рашид', 'рашида', 'рашиду', 'rashid'],
    yougileId: '81061eb1-1547-4004-9a21-3ff871b6aa26',
    email: 'rashid.tadjiev@gmail.com',
    telegram: '@Marshall2221',
    telegramId: 74803663,
    label: 'Рашид',
  },
];

/** Кто может пользоваться ботом в личке (текст / голос). */
const TEAM_OPERATORS = [
  { id: 1696518783, username: 'mundesign', label: 'Тимур' },
  { id: 74803663, username: 'Marshall2221', label: 'Рашид' },
  { id: null, username: 'rauf_cc', label: 'Рауф' },
];

const USERS_PATH = join(ROOT, '.yougile-bot-users.json');
const EPHEMERAL_PATH = join(ROOT, '.yougile-bot-ephemeral.json');
const TASK_MSGS_PATH = join(ROOT, '.yougile-bot-task-msgs.json');

/** Стикер «Приоритет» в YouGile */
const PRIORITY_STICKER_ID = 'e7d00330-5995-48f8-9ba9-3c90c4b22742';
const PRIORITY_STATES = {
  critical: { id: '8160a0fe7bfd', label: 'critical (критично)', short: 'критично' },
  major: { id: '9e60ccfcc6ef', label: 'major (важно)', short: 'важно' },
  normal: { id: '60b2aabd701d', label: 'normal (обычно)', short: 'обычно' },
  low: { id: 'ecb62b612ad9', label: 'low (низкий)', short: 'низкий' },
};

/**
 * @typedef {{
 *   title: string,
 *   type: string,
 *   context: string,
 *   asNow: string,
 *   asShould: string,
 *   tech: string,
 *   source: string,
 *   raw: string,
 *   assigneeKeys: string[],
 *   priority: 'critical'|'major'|'normal'|'low',
 *   creatorKey?: string,
 *   creatorLabel?: string,
 *   creatorTelegram?: string,
 * }} TaskDraft
 */

/** @type {Map<number, { step: string, title?: string, draft?: TaskDraft }>} */
const sessions = new Map();

function env(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

function ygHeaders() {
  return {
    Authorization: `Bearer ${env('YOUGILE_API_KEY')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function taskLink(companyId, taskId) {
  return `https://ru.yougile.com/team/${companyId.slice(-12)}/#chat:${taskId.slice(-12)}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripMarkerFromDesc(htmlOrText) {
  return String(htmlOrText || '')
    .replace(new RegExp(`\\s*#?${MARKER}\\s*`, 'gi'), '')
    .replace(/<p>\s*<\/p>/gi, '')
    .trim();
}

function loadKnownUsers() {
  try {
    if (existsSync(USERS_PATH)) return JSON.parse(readFileSync(USERS_PATH, 'utf8'));
  } catch {
    /* ignore */
  }
  return { users: {} };
}

function saveKnownUsers(data) {
  writeFileSync(USERS_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

/** Подтянуть telegramId исполнителей из файла /start. */
function hydratePeopleTelegramIds() {
  const known = loadKnownUsers().users || {};
  for (const u of Object.values(known)) {
    const uname = String(u?.username || '')
      .toLowerCase()
      .replace(/^@/, '');
    if (!uname || u?.id == null) continue;
    for (const p of PEOPLE) {
      if (p.telegram.replace(/^@/, '').toLowerCase() === uname) {
        p.telegramId = Number(u.id);
      }
    }
  }
}

/** Запоминаем telegram id после /start — чтобы потом слать в личку. */
function rememberTelegramUser(from) {
  if (!from?.id) return;
  const data = loadKnownUsers();
  if (!data.users) data.users = {};
  data.users[String(from.id)] = {
    id: from.id,
    username: from.username || '',
    firstName: from.first_name || '',
    lastName: from.last_name || '',
    updatedAt: new Date().toISOString(),
  };
  saveKnownUsers(data);
  // подтянуть id Рауфа в рантайм-кэш PEOPLE
  const uname = String(from.username || '').toLowerCase();
  for (const p of PEOPLE) {
    if (p.telegram.replace(/^@/, '').toLowerCase() === uname) {
      p.telegramId = from.id;
    }
  }
}

function allowedIdSet() {
  const ids = new Set();
  const names = new Set();
  for (const op of TEAM_OPERATORS) {
    if (op.id != null) ids.add(Number(op.id));
    if (op.username) names.add(String(op.username).toLowerCase().replace(/^@/, ''));
  }
  for (const p of PEOPLE) {
    if (p.telegramId != null) ids.add(Number(p.telegramId));
    if (p.telegram) names.add(p.telegram.replace(/^@/, '').toLowerCase());
  }
  // env override / дополнение: YOUGILE_BOT_ALLOW=id,@user,id2
  for (const part of splitChatIds(env('YOUGILE_BOT_ALLOW'))) {
    if (/^\d+$/.test(part)) ids.add(Number(part));
    else names.add(part.replace(/^@/, '').toLowerCase());
  }
  // уже писавшие /start
  const known = loadKnownUsers().users || {};
  for (const u of Object.values(known)) {
    if (u?.id) ids.add(Number(u.id));
    if (u?.username) names.add(String(u.username).toLowerCase());
  }
  return { ids, names };
}

function isAllowedOperator(from) {
  if (!from) return false;
  const { ids, names } = allowedIdSet();
  if (ids.has(Number(from.id))) return true;
  const uname = String(from.username || '')
    .toLowerCase()
    .replace(/^@/, '');
  if (uname && names.has(uname)) return true;
  return false;
}

async function denyAccess(chatId) {
  await reply(
    chatId,
    'Доступ только для команды Taneesh (Тимур, Рашид @Marshall2221, Рауф @rauf_cc).\n' +
      'Если ты из команды — напиши Тимуру.',
  );
}

async function tg(method, body) {
  const token = env('YOUGILE_TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('YOUGILE_TELEGRAM_BOT_TOKEN missing');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) {
    console.error('tg', method, data);
    throw new Error(data.description || 'telegram error');
  }
  return data.result;
}

function mainKeyboard() {
  return {
    keyboard: [[{ text: BTN_NEW }], [{ text: BTN_SYNC }]],
    resize_keyboard: true,
  };
}

function cancelKeyboard() {
  return {
    keyboard: [[{ text: BTN_CANCEL }]],
    resize_keyboard: true,
  };
}

async function reply(chatId, text, extra = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  };
  try {
    return await tg('sendMessage', payload);
  } catch (e) {
    console.error('reply HTML failed, plain fallback', e.message);
    const { parse_mode: _p, ...rest } = payload;
    return tg('sendMessage', { ...rest, text: htmlToText(text) });
  }
}

function chatKey(chatId) {
  return String(chatId);
}

function loadEphemeralStore() {
  try {
    if (existsSync(EPHEMERAL_PATH)) return JSON.parse(readFileSync(EPHEMERAL_PATH, 'utf8'));
  } catch {
    /* ignore */
  }
  return {};
}

function saveEphemeralStore(data) {
  try {
    writeFileSync(EPHEMERAL_PATH, `${JSON.stringify(data)}\n`);
  } catch (e) {
    console.error('ephemeral save', e.message);
  }
}

/** @returns {{ bot: number[], user: number[] }} */
function normalizeBucket(v) {
  if (!v) return { bot: [], user: [] };
  if (Array.isArray(v)) return { bot: v, user: [] };
  return {
    bot: Array.isArray(v.bot) ? v.bot : [],
    user: Array.isArray(v.user) ? v.user : [],
  };
}

function trackEphemeral(chatId, msgOrId, kind = 'bot') {
  const id = typeof msgOrId === 'number' ? msgOrId : msgOrId?.message_id;
  if (chatId == null || id == null) return;
  const key = chatKey(chatId);
  const store = loadEphemeralStore();
  const bucket = normalizeBucket(store[key]);
  const list = kind === 'user' ? bucket.user : bucket.bot;
  if (!list.includes(id)) list.push(id);
  store[key] = bucket;
  saveEphemeralStore(store);
}

function trackUserMessage(chatId, msgOrId) {
  trackEphemeral(chatId, msgOrId, 'user');
}

async function replyEphemeral(chatId, text, extra = {}) {
  const msg = await reply(chatId, text, extra);
  trackEphemeral(chatId, msg, 'bot');
  return msg;
}

async function deleteTgMessage(chatId, messageId) {
  if (chatId == null || messageId == null) return false;
  try {
    await tg('deleteMessage', {
      chat_id: Number(chatId) || chatId,
      message_id: messageId,
    });
    return true;
  } catch (e) {
    console.error('deleteMessage', chatId, messageId, e.message);
    return false;
  }
}

/**
 * Чистит сообщения бота. С includeUser — ещё и сообщения пользователя.
 * Id убираем из стора только после успешного delete.
 */
async function purgeEphemeral(chatId, { keepIds = [], includeUser = false } = {}) {
  const key = chatKey(chatId);
  const store = loadEphemeralStore();
  const bucket = normalizeBucket(store[key]);
  const keep = new Set(keepIds);

  const botTry = bucket.bot.filter((id) => !keep.has(id));
  const userTry = includeUser ? bucket.user.filter((id) => !keep.has(id)) : [];
  const botKeep = bucket.bot.filter((id) => keep.has(id));
  const userKeepBase = includeUser
    ? bucket.user.filter((id) => keep.has(id))
    : [...bucket.user];

  const botLeft = [];
  const userLeft = [];
  for (const id of botTry) {
    if (!(await deleteTgMessage(chatId, id))) botLeft.push(id);
  }
  for (const id of userTry) {
    if (!(await deleteTgMessage(chatId, id))) userLeft.push(id);
  }

  const nextBot = [...botKeep, ...botLeft];
  const nextUser = [...userKeepBase, ...userLeft];
  if (!nextBot.length && !nextUser.length) delete store[key];
  else store[key] = { bot: nextBot, user: nextUser };
  saveEphemeralStore(store);
}

/** Удаляет сообщение с кнопками черновика; если нельзя — хотя бы снимает клавиатуру. */
async function dismissCallbackMessage(cq) {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  if (chatId == null || messageId == null) return;
  try {
    await tg('deleteMessage', { chat_id: chatId, message_id: messageId });
    return;
  } catch (e) {
    console.error('deleteMessage', e.message);
  }
  try {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    /* ignore */
  }
}

function splitChatIds(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Группа — только «Создание». */
function groupChatIds() {
  return splitChatIds(env('YOUGILE_TELEGRAM_CHAT_ID'));
}

function isGroupNotifyChat(chatId) {
  const id = String(chatId);
  return groupChatIds().some((g) => String(g) === id);
}

function isPrivateChat(chat) {
  return chat?.type === 'private';
}

/** Личка — переносы, удаления и всё кроме новых задач. */
function privateChatIds() {
  const explicit = splitChatIds(env('YOUGILE_TELEGRAM_CHAT_ID_PRIVATE'));
  if (explicit.length) return explicit;
  // fallback: первый organizer id
  return splitChatIds(env('TELEGRAM_ORGANIZER_IDS')).slice(0, 1);
}

/**
 * @param {'group'|'dm'|'direct'} channel
 * group → новые задачи; dm → перенос/удаление; direct → конкретные chat id (исполнители)
 */
async function notifyTelegram(html, { channel = 'group', alsoChatId, toChatIds, reply_markup } = {}) {
  const ids = new Set(
    channel === 'direct'
      ? (toChatIds || []).map(String)
      : channel === 'dm'
        ? privateChatIds()
        : groupChatIds(),
  );
  if (alsoChatId != null) ids.add(String(alsoChatId));
  if (!ids.size) {
    console.error(
      `notifyTelegram(${channel}): no chat id — set YOUGILE_TELEGRAM_CHAT_ID` +
        (channel === 'dm' ? '_PRIVATE' : channel === 'direct' ? ' (assignee telegramId)' : ''),
    );
    return { ok: false, sent: 0, errors: ['no chat id'], messages: [] };
  }

  const threadId = channel === 'group' ? env('YOUGILE_NOTIFY_THREAD_ID') : '';
  const plain = htmlToText(html);
  let sent = 0;
  const errors = [];
  const messages = [];

  for (const chatId of ids) {
    let delivered = false;
    for (let attempt = 1; attempt <= 3 && !delivered; attempt++) {
      try {
        const body = {
          chat_id: chatId,
          text: html,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        };
        if (threadId) body.message_thread_id = Number(threadId);
        if (reply_markup) body.reply_markup = reply_markup;
        const msg = await tg('sendMessage', body);
        delivered = true;
        sent += 1;
        if (msg?.message_id != null) {
          messages.push({ chatId: String(chatId), messageId: msg.message_id });
        }
      } catch (e1) {
        try {
          const body = {
            chat_id: chatId,
            text: plain.slice(0, 4000),
            disable_web_page_preview: true,
          };
          if (threadId) body.message_thread_id = Number(threadId);
          if (reply_markup) body.reply_markup = reply_markup;
          const msg = await tg('sendMessage', body);
          delivered = true;
          sent += 1;
          if (msg?.message_id != null) {
            messages.push({ chatId: String(chatId), messageId: msg.message_id });
          }
        } catch (e2) {
          console.error(
            `notifyTelegram(${channel}) chat=${chatId} attempt=${attempt}`,
            e1.message,
            e2.message,
          );
          if (attempt === 3) errors.push(`${chatId}: ${e2.message}`);
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }
  }

  if (!sent) console.error(`notifyTelegram(${channel}) FAILED`, errors);
  else console.log(`notifyTelegram(${channel}) sent`, sent, 'chats', [...ids].join(','));
  return { ok: sent > 0, sent, errors, messages };
}

/** @deprecated alias — новые задачи в группу */
async function notifyGroup(html, opts = {}) {
  return notifyTelegram(html, { ...opts, channel: 'group' });
}

async function notifyDm(html, opts = {}) {
  return notifyTelegram(html, { ...opts, channel: 'dm' });
}

/** Личка только указанным chat id (исполнители), не в YOUGILE_TELEGRAM_CHAT_ID_PRIVATE. */
async function notifyDirect(chatIds, html, opts = {}) {
  return notifyTelegram(html, { ...opts, channel: 'direct', toChatIds: chatIds });
}

async function fetchBoards() {
  const projectId = env('YOUGILE_PROJECT_ID');
  const r = await fetch(`${YG_API}/boards?projectId=${projectId}&limit=50`, {
    headers: ygHeaders(),
  });
  if (!r.ok) throw new Error(`boards ${r.status}`);
  const data = await r.json();
  const out = {};
  for (const b of data.content || []) {
    if (b.deleted) continue;
    const cr = await fetch(`${YG_API}/columns?boardId=${b.id}&limit=50`, {
      headers: ygHeaders(),
    });
    const cols = await cr.json();
    const columns = {};
    for (const c of cols.content || []) {
      if (c.id && !c.deleted) columns[c.title || ''] = c.id;
    }
    out[b.title || ''] = { id: b.id, columns };
  }
  return out;
}

function pickSandboxColumn(boards) {
  const board =
    boards.Sandbox ||
    boards.Inbox ||
    boards['Идеи со звонков'] ||
    boards.sandbox;
  if (!board) throw new Error('Sandbox board not found');
  const boardName =
    boards.Sandbox ? 'Sandbox' : boards.Inbox ? 'Inbox' : Object.keys(boards).find((k) => boards[k] === board);
  const cols = board.columns;
  for (const name of ['Нераспределённое', 'Уточнить', 'Готово к работе', 'Бэклог', 'To Do', 'Inbox']) {
    if (cols[name]) return { board: boardName || 'Sandbox', column: name, columnId: cols[name] };
  }
  const [column, columnId] = Object.entries(cols)[0] || [];
  if (!columnId) throw new Error('Sandbox has no columns');
  return { board: boardName || 'Sandbox', column, columnId };
}

async function createYougileTask({ title, descriptionHtml, columnId, assigned, stickers }) {
  const body = {
    title,
    columnId,
    description: descriptionHtml,
  };
  if (assigned?.length) body.assigned = assigned;
  if (stickers && Object.keys(stickers).length) body.stickers = stickers;
  const r = await fetch(`${YG_API}/tasks`, {
    method: 'POST',
    headers: ygHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`create task ${r.status}: ${t.slice(0, 200)}`);
  }
  const { id } = await r.json();
  const patch = {};
  if (assigned?.length) patch.assigned = assigned;
  if (stickers && Object.keys(stickers).length) patch.stickers = stickers;
  if (Object.keys(patch).length) {
    await fetch(`${YG_API}/tasks/${id}`, {
      method: 'PUT',
      headers: ygHeaders(),
      body: JSON.stringify(patch),
    });
  }
  const full = await fetch(`${YG_API}/tasks/${id}`, { headers: ygHeaders() }).then((x) =>
    x.json(),
  );
  return full;
}

async function deleteYougileTask(taskId) {
  const r = await fetch(`${YG_API}/tasks/${taskId}`, {
    method: 'PUT',
    headers: ygHeaders(),
    body: JSON.stringify({ deleted: true }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`delete task ${r.status}: ${t.slice(0, 200)}`);
  }
  return true;
}

function loadTaskMsgs() {
  try {
    if (existsSync(TASK_MSGS_PATH)) return JSON.parse(readFileSync(TASK_MSGS_PATH, 'utf8'));
  } catch {
    /* ignore */
  }
  return {};
}

function saveTaskMsgs(data) {
  try {
    writeFileSync(TASK_MSGS_PATH, `${JSON.stringify(data)}\n`);
  } catch (e) {
    console.error('task msgs save', e.message);
  }
}

function rememberTaskMessages(taskId, messages) {
  if (!taskId || !messages?.length) return;
  const store = loadTaskMsgs();
  const prev = store[taskId]?.messages || [];
  const merged = [...prev];
  for (const m of messages) {
    if (!m?.chatId || m.messageId == null) continue;
    if (!merged.some((x) => String(x.chatId) === String(m.chatId) && x.messageId === m.messageId)) {
      merged.push({ chatId: String(m.chatId), messageId: m.messageId });
    }
  }
  store[taskId] = { messages: merged, updatedAt: new Date().toISOString() };
  saveTaskMsgs(store);
}

function takeTaskMessages(taskId) {
  const store = loadTaskMsgs();
  const list = store[taskId]?.messages || [];
  delete store[taskId];
  saveTaskMsgs(store);
  return list;
}

function createdTaskKeyboard(taskId) {
  return {
    inline_keyboard: [[{ text: '🗑 Удалить', callback_data: `${CB_TASK_DEL_PREFIX}${taskId}` }]],
  };
}

function peopleByKeys(keys) {
  const set = new Set(keys || []);
  return PEOPLE.filter((p) => set.has(p.key));
}

function peopleByYougileIds(ids) {
  const set = new Set((ids || []).map(String));
  return PEOPLE.filter((p) => set.has(String(p.yougileId)));
}

/** YouGile assigned ids, которых не было в предыдущем снимке. */
function newlyAssignedIds(prevAssigned, nextAssigned) {
  const had = new Set((prevAssigned || []).map(String));
  return [...new Set((nextAssigned || []).map(String))].filter((id) => id && !had.has(id));
}

function formatAssigneeAssignedNotify(payload) {
  return `<b>📌 Вам назначена задача</b>\n\n${formatCreateNotify(payload)}`;
}

/**
 * Личка только новым исполнителям (PEOPLE → telegramId).
 * Группу и YOUGILE_TELEGRAM_CHAT_ID_PRIVATE не трогает.
 */
async function notifyAssigneesAssigned(yougileUserIds, payload) {
  hydratePeopleTelegramIds();
  const people = peopleByYougileIds(yougileUserIds);
  if (!people.length) {
    if ((yougileUserIds || []).length) {
      console.warn(
        'assignee notify: unknown YouGile user ids',
        (yougileUserIds || []).map(String).join(','),
      );
    }
    return { ok: false, sent: 0, errors: ['unknown assignees'], messages: [] };
  }

  let sent = 0;
  const errors = [];
  const messages = [];

  for (const p of people) {
    if (p.telegramId == null) {
      const err = `${p.key}: нет telegram id — пусть напишет /start боту`;
      console.error('assignee notify:', err);
      errors.push(err);
      continue;
    }
    const html = formatAssigneeAssignedNotify({
      ...payload,
      assigneesText: `${p.label} ${p.telegram}`,
    });
    const r = await notifyDirect([p.telegramId], html);
    sent += r.sent || 0;
    if (r.messages?.length) messages.push(...r.messages);
    if (!r.ok) errors.push(...(r.errors || [`${p.key}: fail`]));
  }

  return { ok: sent > 0, sent, errors, messages };
}

async function fetchTaskDescription(taskId, fallback = '') {
  if (fallback) return fallback;
  try {
    const full = await fetch(`${YG_API}/tasks/${taskId}`, {
      headers: ygHeaders(),
    }).then((r) => r.json());
    return full.description || '';
  } catch {
    return '';
  }
}

function resolveCreator(from) {
  if (!from) {
    return { key: 'unknown', label: 'Неизвестно', telegram: '' };
  }
  const id = Number(from.id);
  const uname = String(from.username || '')
    .toLowerCase()
    .replace(/^@/, '');
  for (const op of TEAM_OPERATORS) {
    if (op.id != null && Number(op.id) === id) {
      return {
        key: op.username || String(op.id),
        label: op.label,
        telegram: op.username ? `@${op.username}` : '',
      };
    }
    if (op.username && op.username.toLowerCase() === uname) {
      return {
        key: op.username,
        label: op.label,
        telegram: `@${op.username}`,
      };
    }
  }
  for (const p of PEOPLE) {
    if (
      (p.telegramId != null && Number(p.telegramId) === id) ||
      p.telegram.replace(/^@/, '').toLowerCase() === uname
    ) {
      return { key: p.key, label: p.label, telegram: p.telegram };
    }
  }
  return {
    key: uname || String(id),
    label: from.first_name || uname || String(id),
    telegram: uname ? `@${uname}` : '',
  };
}

function formatCreatorLine(draft) {
  const label = draft.creatorLabel || 'Неизвестно';
  const tg = draft.creatorTelegram || '';
  return tg ? `${label} ${tg}` : label;
}

function formatAssigneesTelegram(keys) {
  const people = peopleByKeys(keys);
  if (!people.length) return 'не назначен';
  return people.map((p) => `${p.label} ${p.telegram}`).join(', ');
}

function formatAssigneesPreview(keys) {
  const people = peopleByKeys(keys);
  if (!people.length) return 'не назначен';
  return people.map((p) => `${p.label} (${p.telegram}, ${p.email})`).join('\n');
}

/** Короткие имена для превью в Telegram (как в гайде). */
function formatAssigneesDraftLine(keys) {
  const people = peopleByKeys(keys);
  if (!people.length) return '<i>не назначен</i>';
  return people.map((p) => `<b>${escapeHtml(p.label)}</b> ${escapeHtml(p.telegram)}`).join(' · ');
}

function parseAssigneesFromText(text) {
  const lower = String(text || '').toLowerCase();
  const keys = [];
  for (const p of PEOPLE) {
    if (p.names.some((n) => new RegExp(`(?<!\\p{L})${n}(?!\\p{L})`, 'iu').test(lower))) {
      keys.push(p.key);
    }
  }
  return keys;
}

function parsePriorityFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/критич|asap|горит|пиздец|очень срочн|блокер|blocker|critical/.test(t)) return 'critical';
  if (/срочн|важно|высок(ий|ого)?\s*приоритет|major|высокий приоритет/.test(t)) return 'major';
  if (/несрочн|низк|потом|low|не горит|можно позже/.test(t)) return 'low';
  if (/обычн|средн|normal|стандарт/.test(t)) return 'normal';
  return 'normal';
}

function formatTypeCodes(type) {
  const raw = dash(type);
  if (raw === '—') return '<i>—</i>';
  return raw
    .split(/\s*[·/,|]\s*/)
    .filter(Boolean)
    .map((t) => `<code>${escapeHtml(t)}</code>`)
    .join(' · ');
}

function cutField(s, n = 700) {
  const t = dash(s);
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Блоки 1–8 в цитате — общий вид для черновика и уведомления в группу. */
function formatTaskBlocksHtml(draft) {
  const prio = PRIORITY_STATES[draft.priority] || PRIORITY_STATES.normal;
  return (
    '<blockquote>' +
    '<b>1. Название</b>\n' +
    `<i>${escapeHtml(cutField(draft.title, 200))}</i>\n\n` +
    '<b>2. Тип</b>\n' +
    `${formatTypeCodes(draft.type)}\n\n` +
    '<b>3. Контекст</b>\n' +
    `<i>${escapeHtml(cutField(draft.context))}</i>\n\n` +
    '<b>4. Как сейчас</b>\n' +
    `<i>${escapeHtml(cutField(draft.asNow))}</i>\n\n` +
    '<b>5. Как надо</b>\n' +
    `<i>${escapeHtml(cutField(draft.asShould))}</i>\n\n` +
    '<b>6. Технически</b>\n' +
    `<i>${escapeHtml(cutField(draft.tech))}</i>\n\n` +
    '<b>7. Приоритет</b>\n' +
    `<code>${escapeHtml(prio.short || prio.label)}</code>\n\n` +
    '<b>8. Исполнитель</b>\n' +
    `${formatAssigneesDraftLine(draft.assigneeKeys)}\n` +
    `<i>Кто создал: ${escapeHtml(formatCreatorLine(draft))}</i>` +
    '</blockquote>'
  );
}

function formatCreateNotify({
  title,
  code,
  taskId,
  board,
  column,
  description,
  draft = null,
  assigneesText,
  priorityLabel,
  creatorText,
}) {
  const company = env('YOUGILE_COMPANY_ID');
  const link = `<a href="${taskLink(company, taskId)}">Открыть в YouGile</a>`;
  const head = code
    ? `<code>${escapeHtml(code)}</code> · <b>${escapeHtml(title || '—')}</b>`
    : `<b>${escapeHtml(title || '—')}</b>`;
  const place = `<i>${escapeHtml(board)} / ${escapeHtml(column)}</i>`;

  if (draft) {
    return (
      `${head}\n` +
      `${place}\n\n` +
      formatTaskBlocksHtml(draft) +
      (draft.source ? `\n\n<i>Источник: ${escapeHtml(dash(draft.source))}</i>` : '') +
      `\n\n${link}`
    );
  }

  // Синк чужих задач без draft — короткая карточка
  const prio = escapeHtml(priorityLabel || '—');
  let body = htmlToText(stripMarkerFromDesc(description));
  if (body.length > 1200) body = `${body.slice(0, 1200)}…`;
  return (
    `${head}\n` +
    `${place}\n\n` +
    '<blockquote>' +
    `<b>Приоритет</b>\n<code>${prio}</code>\n\n` +
    `<b>Кто создал</b>\n<i>${escapeHtml(creatorText || '—')}</i>\n\n` +
    `<b>Исполнитель</b>\n<i>${escapeHtml(assigneesText || 'не назначен')}</i>\n\n` +
    `<b>Описание</b>\n<i>${escapeHtml(body || '—')}</i>` +
    '</blockquote>\n\n' +
    link
  );
}

function rememberTaskInState(task, board, column) {
  let state = { schema: 4, tasks: {} };
  try {
    if (existsSync(STATE_PATH)) state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    /* ignore */
  }
  if (!state.tasks) state.tasks = {};
  state.schema = 4;
  state.tasks[task.id] = {
    board,
    column,
    columnId: task.columnId,
    title: task.title || '',
    code: task.idTaskProject || '',
    assigned: task.assigned || [],
  };
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function draftKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Создать задачу', callback_data: CB_CREATE }],
      [{ text: '❌ Отменить', callback_data: CB_CANCEL }],
    ],
  };
}

function dash(v) {
  const s = String(v || '').trim();
  return s || '—';
}

function formatDraftPreview(draft) {
  return (
    '<b>Черновик задачи</b>\n' +
    '<i>Проверь и нажми кнопку ниже</i>\n\n' +
    formatTaskBlocksHtml(draft) +
    `\n\n<i>Источник: ${escapeHtml(dash(draft.source))}</i>`
  );
}

function buildTemplateDescription(draft) {
  const p = (label, value) =>
    `<p><b>${escapeHtml(label)}</b></p><p>${escapeHtml(dash(value)).replace(/\n/g, '<br/>')}</p>`;
  const prio = PRIORITY_STATES[draft.priority] || PRIORITY_STATES.normal;
  const assignees = formatAssigneesPreview(draft.assigneeKeys);
  return (
    p('Тип', draft.type) +
    p('Приоритет', prio.label) +
    p('Кто создал', formatCreatorLine(draft)) +
    p('Исполнитель', assignees) +
    p('Контекст', draft.context) +
    p('Как сейчас', draft.asNow) +
    p('Как надо', draft.asShould) +
    p('Технически', draft.tech) +
    p('Источник', draft.source) +
    `<p>#${MARKER}</p>`
  );
}

function guessType(text) {
  const t = text.toLowerCase();
  if (/баг|не работает|лома|багфикс|пуш(и|ей)? не|не приход/.test(t)) return 'Баг';
  if (/инфраструктур|сервер|api.?нагруз|деплой|docker|бд\b|база/.test(t)) return 'Инфраструктура';
  if (/\bb2b\b|продаж|рассылк|парсер instagram|венчур/.test(t)) return 'B2B / ops';
  if (/\bрелиз\b|выклад(ка|ывать)|в сторы/.test(t)) return 'Релиз';
  if (/метрик|аналитик|счётчик|счита/.test(t)) return 'Баг / аналитика';
  if (/ui|витрин|сетк|экран|дизайн|адаптив/.test(t)) return 'Доработка UI';
  if (/новая фич|хотим сделать|добавить функционал/.test(t)) return 'Новая фича';
  if (/доработ/.test(t)) return 'Доработка';
  return 'Уточнить';
}

function firstSentence(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Без названия';
  const m = t.match(/^(.{8,140}?[.!?…])(\s|$)/u);
  let title = (m?.[1] || t.split(/[.!?…]/)[0] || t).trim();
  if (title.length > 120) title = `${title.slice(0, 117)}…`;
  return title;
}

/**
 * Разбор свободного текста/голоса в нашу структуру.
 * Сначала явные маркеры («тип:», «как сейчас»), потом эвристики по фразам.
 */
export function structureTaskFromText(raw, { source = 'Telegram' } = {}) {
  const text = String(raw || '').trim();
  if (!text) {
    return {
      title: 'Без названия',
      type: 'Уточнить',
      context: '—',
      asNow: '—',
      asShould: '—',
      tech: '—',
      source,
      raw: '',
      assigneeKeys: [],
      priority: 'normal',
    };
  }

  const labeled = {};
  // Порядок важен: сначала длинные фразы
  const labelNames =
    'название|заголовок|как сейчас|как надо|как должно|контекст|технически|техн\\.?|источник|тип|проблема|сейчас|надо|исполнитель|приоритет|срочность';
  const findRe = new RegExp(`(?:^|[.\\n;!?]|\\s)(${labelNames})\\s*[:\\-–—]\\s*`, 'gi');
  const found = [];
  let m;
  while ((m = findRe.exec(text))) {
    found.push({
      key: m[1].toLowerCase(),
      start: m.index + m[0].length,
      labelAt: m.index,
    });
  }
  found.sort((a, b) => a.start - b.start);
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].labelAt : text.length;
    const val = text
      .slice(found[i].start, end)
      .trim()
      .replace(/[.\s]+$/u, '')
      .trim();
    if (!val) continue;
    const k = found[i].key;
    if (/название|заголовок/.test(k)) labeled.title = val;
    else if (k === 'тип') labeled.type = val;
    else if (k === 'контекст') labeled.context = val;
    else if (/как сейчас|проблема|сейчас/.test(k)) labeled.asNow = val;
    else if (/как надо|как должно|^надо$/.test(k)) labeled.asShould = val;
    else if (/технически|техн/.test(k)) labeled.tech = val;
    else if (k === 'источник') labeled.source = val;
    else if (k === 'исполнитель') labeled.assigneesRaw = val;
    else if (/приоритет|срочность/.test(k)) labeled.priorityRaw = val;
  }

  // \b в JS не работает с кириллицей — границы через \p{L}
  const sectionSplit =
    /(?<!\p{L})(?:тип|контекст|как сейчас|как надо|как должно|технически|источник)\s*[:\-–—]|(?<!\p{L})сейчас(?=[,:\s])|(?<!\p{L})надо(?:\s+чтобы)?(?!\p{L})|(?<!\p{L})технически(?!\p{L})/iu;

  const pickAfter = (patterns) => {
    for (const pat of patterns) {
      const mm = text.match(pat);
      if (!mm) continue;
      let chunk = (mm[1] || '').trim();
      const cut = chunk.search(sectionSplit);
      if (cut > 0) chunk = chunk.slice(0, cut);
      chunk = chunk.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/u, '');
      if (chunk.length > 3) return chunk;
    }
    return '';
  };

  if (!labeled.asNow) {
    labeled.asNow = pickAfter([
      /как сейчас[:\s—–-]*(.+)/iu,
      /сейчас(?=[,:\s])[,:\s]+(.+)/iu,
      /проблема(?:\s+в том)?,?\s*(?:что)?[:\s]*(.+)/iu,
      /не работает[:\s]*(.+)/iu,
    ]);
  }
  if (!labeled.asShould) {
    labeled.asShould = pickAfter([
      /как надо[:\s—–-]*(.+)/iu,
      /надо(?:\s+чтобы)?[:\s]*(.+)/iu,
      /хотим[,:\s]+(.+)/iu,
      /должно(?:\s+быть)?[:\s]*(.+)/iu,
    ]);
  }
  if (!labeled.tech) {
    labeled.tech = pickAfter([
      /технически[:\s—–-]*(.+)/iu,
      /на бэке[:\s]*(.+)/iu,
      /в api[:\s]*(.+)/iu,
    ]);
  }
  if (!labeled.context) {
    const cutAt = text.search(
      /(?<!\p{L})(?:как сейчас|как надо|технически)(?!\p{L})|(?<!\p{L})сейчас(?=[,:\s])|(?<!\p{L})надо(?:\s+чтобы)?(?!\p{L})/iu,
    );
    labeled.context = (cutAt > 20 ? text.slice(0, cutAt) : text).replace(/\s+/g, ' ').trim();
  }

  const title = (labeled.title || firstSentence(text)).slice(0, 200);
  const assigneeKeys = [
    ...new Set([
      ...parseAssigneesFromText(text),
      ...parseAssigneesFromText(labeled.assigneesRaw || ''),
    ]),
  ];
  const priority = labeled.priorityRaw
    ? parsePriorityFromText(labeled.priorityRaw)
    : parsePriorityFromText(text);
  return {
    title,
    type: labeled.type || guessType(text),
    context: labeled.context || text,
    asNow: labeled.asNow || '—',
    asShould: labeled.asShould || '—',
    tech: labeled.tech || '—',
    source: labeled.source || source,
    raw: text,
    assigneeKeys,
    priority,
  };
}

/** Optional LLM refine: Groq (preferred) or OpenAI. */
async function refineDraftWithLlm(draft) {
  if (!draft.raw) return draft;
  const groqKey = env('GROQ_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');
  if (!groqKey && !openaiKey) return draft;

  const messages = [
    {
      role: 'system',
      content:
        'Ты помощник Taneesh. Разложи текст задачи на JSON поля: ' +
        'title, type, context, asNow, asShould, tech, assignees, priority. ' +
        'type — коротко (Баг, Доработка UI, Новая фича, Инфраструктура, B2B / ops, Релиз, Баг / аналитика, Уточнить). ' +
        'assignees — массив из ключей: только "rauf" и/или "rashid" (по именам Рауф/Рашид в тексте). Если не сказано — []. ' +
        'priority — одно из: critical, major, normal, low (срочность/приоритет). ' +
        'Пиши по-русски, без воды. Если поля нет — "—". Верни только JSON.',
    },
    { role: 'user', content: draft.raw },
  ];

  try {
    let data;
    if (groqKey) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env('GROQ_STRUCTURE_MODEL', 'llama-3.3-70b-versatile'),
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      if (!r.ok) {
        console.error('refineDraft groq', r.status, await r.text());
        if (!openaiKey) return draft;
      } else {
        data = await r.json();
      }
    }
    if (!data && openaiKey) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env('OPENAI_STRUCTURE_MODEL', 'gpt-4o-mini'),
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      if (!r.ok) return draft;
      data = await r.json();
    }
    const raw = data?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw);
    let assigneeKeys = Array.isArray(parsed.assignees)
      ? parsed.assignees.map(String).filter((k) => k === 'rauf' || k === 'rashid')
      : [];
    if (!assigneeKeys.length) assigneeKeys = draft.assigneeKeys || [];
    let priority = String(parsed.priority || draft.priority || 'normal').toLowerCase();
    if (!PRIORITY_STATES[priority]) priority = draft.priority || 'normal';
    return {
      ...draft,
      title: String(parsed.title || draft.title).slice(0, 200),
      type: String(parsed.type || draft.type),
      context: String(parsed.context || draft.context),
      asNow: String(parsed.asNow || draft.asNow),
      asShould: String(parsed.asShould || draft.asShould),
      tech: String(parsed.tech || draft.tech),
      assigneeKeys,
      priority,
    };
  } catch (e) {
    console.error('refineDraft', e.message);
    return draft;
  }
}

async function handleStart(chatId, userMsgId = null) {
  await purgeEphemeral(chatId, { includeUser: true });
  sessions.delete(chatId);
  await replyEphemeral(
    chatId,
    '<b>Taneesh YouGile</b>\n' +
      '<i>Sandbox → Нераспределённое</i>\n\n' +
      '• <b>Новая задача</b> — пришли текст или войсик\n' +
      '• Дальше: <b>Создать</b> или <b>Отменить</b>\n\n' +
      STRUCTURE_GUIDE,
    { reply_markup: mainKeyboard() },
  );
  // Команду /start сразу убираем из чата (остаётся только гайд)
  if (userMsgId != null) {
    await deleteTgMessage(chatId, userMsgId);
  }
}

async function beginCapture(chatId) {
  await purgeEphemeral(chatId, { includeUser: true });
  sessions.set(chatId, { step: 'await_input' });
  await replyEphemeral(
    chatId,
    '⬇️ <b>Пришли текст или голосовое</b>\n' +
      '<i>Покажу расшифровку — создам только после кнопки</i>',
    { reply_markup: cancelKeyboard() },
  );
}

async function showDraftPreview(chatId, draft) {
  // Не чистим здесь — все промежуточные (вкл. «Пришли текст») удалим после Создать/Отменить
  const prev = sessions.get(chatId);
  sessions.set(chatId, { step: 'preview', draft, ...(prev?.title ? { title: prev.title } : {}) });
  await replyEphemeral(chatId, formatConfirmPreview(draft), {
    reply_markup: draftKeyboard(),
  });
}

async function ingestRawInput(chatId, raw, { source = 'Telegram', from = null } = {}) {
  // Быстрый разбор без LLM — полную структуру делаем при «Создать»
  const draft = structureTaskFromText(raw, { source });
  const creator = resolveCreator(from);
  draft.creatorKey = creator.key;
  draft.creatorLabel = creator.label;
  draft.creatorTelegram = creator.telegram;
  await showDraftPreview(chatId, draft);
}

/** Превью до создания: только сырой текст (расшифровка / ввод) + кнопки. */
function formatConfirmPreview(draft) {
  const isVoice = /голос/i.test(String(draft.source || ''));
  const text = String(draft.raw || '').trim();
  const cut = text.length > 3500 ? `${text.slice(0, 3500)}…` : text;
  return (
    (isVoice ? '<b>📝 Расшифровка</b>\n' : '<b>📝 Текст</b>\n') +
    '<i>Проверь и нажми кнопку ниже</i>\n\n' +
    '<blockquote>' +
    `<i>${escapeHtml(cut || '—')}</i>` +
    '</blockquote>'
  );
}

function formatCreatedReply({
  code,
  title,
  board,
  column,
  draft,
  notifyLine,
  link,
}) {
  const codeLine = code
    ? `<code>${escapeHtml(code)}</code> · <b>${escapeHtml(title || '—')}</b>`
    : `<b>${escapeHtml(title || '—')}</b>`;
  return (
    '<b>✅ Создано</b>\n' +
    `${codeLine}\n` +
    `<i>${escapeHtml(board)} / ${escapeHtml(column)}</i>\n\n` +
    formatTaskBlocksHtml(draft) +
    (draft?.source ? `\n\n<i>Источник: ${escapeHtml(dash(draft.source))}</i>` : '') +
    `\n\n<i>${notifyLine}</i>\n` +
    `<a href="${link}">Открыть в YouGile</a>`
  );
}

async function createFromDraft(chatId, draft) {
  // На «Создать» — раскладка по полям + LLM, затем YouGile и карточка 1–8
  let ready = draft;
  const savedCreator = {
    key: draft.creatorKey,
    label: draft.creatorLabel,
    telegram: draft.creatorTelegram,
  };
  ready = await refineDraftWithLlm(ready);
  if (savedCreator.label) {
    ready.creatorKey = savedCreator.key;
    ready.creatorLabel = savedCreator.label;
    ready.creatorTelegram = savedCreator.telegram;
  }

  const boards = await fetchBoards();
  const place = pickSandboxColumn(boards);
  const descHtml = buildTemplateDescription(ready);
  const people = peopleByKeys(ready.assigneeKeys);
  const assigned = people.map((p) => p.yougileId);
  const priority = PRIORITY_STATES[ready.priority] ? ready.priority : 'normal';
  const stickers = {
    [PRIORITY_STICKER_ID]: PRIORITY_STATES[priority].id,
  };

  const titleRaw = String(ready.title || '').trim();
  const title =
    titleRaw && titleRaw !== '—'
      ? titleRaw
      : String(ready.raw || '')
          .trim()
          .split(/[.!?\n]/u)[0]
          .trim()
          .slice(0, 120) || 'Без названия';
  ready.title = title;
  const task = await createYougileTask({
    title: title.slice(0, 200),
    descriptionHtml: descHtml,
    columnId: place.columnId,
    assigned,
    stickers,
  });

  rememberTaskInState(task, place.board, place.column);

  const creatorText = formatCreatorLine(ready);
  const html = formatCreateNotify({
    title: task.title || title,
    code: task.idTaskProject || '',
    taskId: task.id,
    board: place.board,
    column: place.column,
    draft: ready,
    creatorText,
  });

  const notify = await notifyGroup(html, { reply_markup: createdTaskKeyboard(task.id) });
  rememberTaskMessages(task.id, notify.messages || []);

  // Исполнитель → только ему в личку (если уже указан при создании)
  if (assigned.length) {
    const toAssignees = await notifyAssigneesAssigned(assigned, {
      title: task.title || title,
      code: task.idTaskProject || '',
      taskId: task.id,
      board: place.board,
      column: place.column,
      draft: ready,
    });
    rememberTaskMessages(task.id, toAssignees.messages || []);
    if (!toAssignees.ok) {
      console.warn('assignee notify on create:', toAssignees.errors?.join('; ') || 'fail');
    }
  }

  const link = taskLink(env('YOUGILE_COMPANY_ID'), task.id);
  const notifyLine = notify.ok
    ? 'В группу отправил'
    : `Задача есть, но в группу не ушло: ${escapeHtml(notify.errors.join('; ') || 'нет chat_id')}`;

  await purgeEphemeral(chatId, { includeUser: true });
  sessions.delete(chatId);

  const dmMsg = await reply(
    chatId,
    formatCreatedReply({
      code: task.idTaskProject || '',
      title: task.title || title,
      board: place.board,
      column: place.column,
      draft: ready,
      notifyLine,
      link,
    }),
    { reply_markup: createdTaskKeyboard(task.id) },
  );
  rememberTaskMessages(task.id, [
    { chatId: String(chatId), messageId: dmMsg?.message_id },
  ]);

  return { task, notify };
}

function loadState() {
  try {
    if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    /* ignore */
  }
  return { schema: 4, tasks: {} };
}

function saveState(state) {
  state.schema = 4;
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function formatActionNotify({ action, title, code, taskId, board, detail }) {
  const company = env('YOUGILE_COMPANY_ID');
  const head = code
    ? `<b>${escapeHtml(code)}</b> · ${escapeHtml(title)}`
    : `<b>${escapeHtml(title)}</b>`;
  const lines = [`<b>${escapeHtml(action)}</b>`, head];
  if (board) {
    lines.push(escapeHtml(board) + (detail ? `: ${escapeHtml(detail)}` : ''));
  } else if (detail) {
    lines.push(escapeHtml(detail));
  }
  lines.push('', `<a href="${taskLink(company, taskId)}">Открыть в YouGile</a>`);
  return lines.join('\n');
}

async function listColumnTasks(columnId) {
  const out = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(
      `${YG_API}/tasks?columnId=${columnId}&limit=50&offset=${offset}`,
      { headers: ygHeaders() },
    );
    if (!r.ok) throw new Error(`tasks ${r.status}`);
    const data = await r.json();
    for (const t of data.content || []) {
      if (!t.deleted && !t.archived) out.push(t);
    }
    if (!data.paging?.next) break;
    offset += 50;
  }
  return out;
}

async function snapshotAll() {
  const boards = await fetchBoards();
  const snap = {};
  for (const [boardName, board] of Object.entries(boards)) {
    for (const [colName, colId] of Object.entries(board.columns || {})) {
      const tasks = await listColumnTasks(colId);
      for (const t of tasks) {
        snap[t.id] = {
          board: boardName,
          column: colName,
          columnId: colId,
          title: t.title || '',
          code: t.idTaskProject || '',
          assigned: (t.assigned || []).map(String),
          description: t.description || '',
        };
      }
    }
  }
  return snap;
}

function isBotCreatedDesc(desc) {
  return String(desc || '').includes(MARKER) || String(desc || '').includes('data-tg-bot-created');
}

/** Poll YouGile: новые задачи → группа, переносы/удаления → DM, новый assigned → личка исполнителю. */
export async function syncYougileOnce({ quietNew = false } = {}) {
  hydratePeopleTelegramIds();
  const state = loadState();
  let prev = state.tasks || {};
  const snap = await snapshotAll();

  // State пустой (первый запуск / redeploy Render) — baseline без спама в группу
  if (!Object.keys(prev).length) {
    quietNew = true;
    console.log('yougile sync: empty notify state, baselining without group notify');
  } else if (state.schema !== 4) {
    // Смена schema (например после пересоздания колонок) — полный baseline, без переносов/удалений
    quietNew = true;
    prev = {};
    console.log('yougile sync: schema migration, baselining without group notify');
  }

  let sent = 0;

  for (const [tid, info] of Object.entries(snap)) {
    const old = prev[tid];
    if (!old) {
      if (!quietNew) {
        let desc = info.description || '';
        if (!desc) {
          desc = await fetchTaskDescription(tid);
        }
        if (!isBotCreatedDesc(desc)) {
          const n = await notifyGroup(
            formatCreateNotify({
              title: info.title,
              code: info.code,
              taskId: tid,
              board: info.board,
              column: info.column,
              description: desc,
              assigneesText: 'не назначен',
            }),
          );
          if (n.ok) sent += 1;
        }
        // Уже с исполнителем при появлении задачи — сразу в личку исполнителю
        const assignedNow = info.assigned || [];
        if (assignedNow.length) {
          const a = await notifyAssigneesAssigned(assignedNow, {
            title: info.title,
            code: info.code,
            taskId: tid,
            board: info.board,
            column: info.column,
            description: desc,
          });
          if (a.sent) sent += a.sent;
        }
      }
      continue;
    }
    const moved = old.columnId !== info.columnId || old.board !== info.board;
    if (moved) {
      const detail =
        old.board !== info.board
          ? `${old.board}/${old.column || '?'} → ${info.board}/${info.column}`
          : `${old.column || '?'} → ${info.column}`;
      const n = await notifyDm(
        formatActionNotify({
          action: 'Перенос',
          title: info.title,
          code: info.code || old.code || '',
          taskId: tid,
          board: info.board,
          detail,
        }),
      );
      if (n.ok) sent += 1;
    }

    // Новый исполнитель на уже известной задаче (в т.ч. старой без assigned)
    if (!quietNew) {
      const added = newlyAssignedIds(old.assigned, info.assigned);
      if (added.length) {
        const desc = await fetchTaskDescription(tid, info.description || '');
        const a = await notifyAssigneesAssigned(added, {
          title: info.title,
          code: info.code || old.code || '',
          taskId: tid,
          board: info.board,
          column: info.column,
          description: desc,
        });
        if (a.sent) sent += a.sent;
      }
    }
  }

  if (!quietNew) {
    for (const [tid, old] of Object.entries(prev)) {
      if (snap[tid]) continue;
      const n = await notifyDm(
        formatActionNotify({
          action: 'Удаление',
          title: old.title || 'без названия',
          code: old.code || '',
          taskId: tid,
          board: old.board || '',
          detail: old.column || '',
        }),
      );
      if (n.ok) sent += 1;
    }
  }

  const next = { schema: 4, tasks: {}, baselinedAt: state.baselinedAt || new Date().toISOString() };
  for (const [tid, info] of Object.entries(snap)) {
    next.tasks[tid] = {
      board: info.board,
      column: info.column,
      columnId: info.columnId,
      title: info.title,
      code: info.code,
      assigned: info.assigned || [],
    };
  }
  saveState(next);
  return sent;
}

async function runSyncOnce(chatId, userMsgId = null) {
  if (userMsgId != null) trackUserMessage(chatId, userMsgId);
  await replyEphemeral(chatId, '🔄 Проверяю YouGile…');
  try {
    const n = await syncYougileOnce();
    await replyEphemeral(chatId, `Готово. Отправлено уведомлений: <b>${n}</b>`, {
      reply_markup: mainKeyboard(),
    });
    await purgeEphemeral(chatId, { includeUser: true });
  } catch (e) {
    console.error(e);
    await purgeEphemeral(chatId, { includeUser: true });
    await reply(chatId, `Ошибка синка: ${escapeHtml(e.message)}`, {
      reply_markup: mainKeyboard(),
    });
  }
}

export function startYougilePolling(intervalMs = 60_000) {
  if (!yougileBotConfigured()) return;
  const tick = async () => {
    try {
      const n = await syncYougileOnce();
      if (n) console.log('yougile poll sent', n);
    } catch (e) {
      console.error('yougile poll', e.message);
    }
  };
  syncYougileOnce({ quietNew: true })
    .then(() => console.log('yougile poll baselined'))
    .catch((e) => console.error('yougile baseline', e.message));
  setInterval(tick, intervalMs);
}

async function downloadTelegramFile(fileId) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
  const meta = await tg('getFile', { file_id: fileId });
  const path = meta.file_path;
  if (!path) throw new Error('Telegram file_path empty');
  const token = env('YOUGILE_TELEGRAM_BOT_TOKEN');
  const url = `https://api.telegram.org/file/bot${token}/${path}`;
  const ext = path.includes('.') ? path.split('.').pop() : 'ogg';
  const local = join(TMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download voice ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(local));
  return local;
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts });
    let stdout = '';
    let stderr = '';
    p.stdout?.on('data', (d) => {
      stdout += d;
    });
    p.stderr?.on('data', (d) => {
      stderr += d;
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exit ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

async function transcribeWithGroq(filePath) {
  const key = env('GROQ_API_KEY');
  if (!key) return null;
  const buf = readFileSync(filePath);
  // Telegram voice = *.oga; Groq принимает только whitelist расширений (ogg/opus/…), не .oga
  let name = filePath.split('/').pop() || 'voice.ogg';
  if (/\.oga$/i.test(name)) name = name.replace(/\.oga$/i, '.ogg');
  if (!/\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|opus|wav|webm)$/i.test(name)) {
    name = `${name}.ogg`;
  }
  const form = new FormData();
  form.append('file', new File([buf], name, { type: 'audio/ogg' }));
  form.append('model', env('GROQ_WHISPER_MODEL', 'whisper-large-v3-turbo'));
  form.append('language', 'ru');
  form.append('response_format', 'json');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Groq Whisper ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return String(data.text || '').trim();
}

async function transcribeWithOpenAI(filePath) {
  const key = env('OPENAI_API_KEY');
  if (!key) return null;
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf]), filePath.split('/').pop() || 'voice.ogg');
  form.append('model', 'whisper-1');
  form.append('language', 'ru');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI Whisper ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return String(data.text || '').trim();
}

async function transcribeWithLocalWhisper(filePath) {
  // openai-whisper CLI: `whisper file.ogg --model tiny --language ru --output_format txt`
  try {
    await runCmd('python3', ['-c', 'import whisper']);
  } catch {
    return null;
  }
  const outDir = TMP_DIR;
  await runCmd(
    'python3',
    [
      '-m',
      'whisper',
      filePath,
      '--model',
      env('WHISPER_MODEL', 'tiny'),
      '--language',
      'ru',
      '--output_format',
      'txt',
      '--output_dir',
      outDir,
    ],
    { env: process.env },
  );
  const base = filePath.split('/').pop().replace(/\.[^.]+$/, '');
  const txtPath = join(outDir, `${base}.txt`);
  if (!existsSync(txtPath)) throw new Error('whisper produced no txt');
  const text = readFileSync(txtPath, 'utf8').trim();
  try {
    unlinkSync(txtPath);
  } catch {
    /* ignore */
  }
  return text;
}

async function transcribeVoiceFile(filePath) {
  const errors = [];
  try {
    const groq = await transcribeWithGroq(filePath);
    if (groq) return groq;
    if (!env('GROQ_API_KEY')) errors.push('нет GROQ_API_KEY');
  } catch (e) {
    console.error('groq whisper', e.message);
    errors.push(e.message);
  }
  try {
    const openai = await transcribeWithOpenAI(filePath);
    if (openai) return openai;
  } catch (e) {
    console.error('openai whisper', e.message);
    errors.push(e.message);
  }
  try {
    const local = await transcribeWithLocalWhisper(filePath);
    if (local) return local;
  } catch (e) {
    console.error('local whisper', e.message);
    errors.push(e.message);
  }
  throw new Error(
    errors.length
      ? `Нет расшифровки: ${errors.join(' | ')}`
      : 'Нет расшифровки: добавь GROQ_API_KEY (console.groq.com)',
  );
}

async function handleVoice(chatId, msg) {
  const voice = msg.voice || msg.audio || msg.video_note;
  if (!voice?.file_id) {
    await reply(chatId, 'Не нашёл аудио в сообщении.', { reply_markup: mainKeyboard() });
    return;
  }
  trackUserMessage(chatId, msg.message_id);
  await replyEphemeral(chatId, '🎤 Слушаю и расшифровываю…');
  let local;
  try {
    local = await downloadTelegramFile(voice.file_id);
    const transcript = await transcribeVoiceFile(local);
    if (!transcript) throw new Error('Пустая расшифровка');
    await ingestRawInput(chatId, transcript, {
      source: 'Telegram · голосовое',
      from: msg.from,
    });
  } catch (e) {
    console.error('voice', e);
    await purgeEphemeral(chatId, { includeUser: true });
    await reply(chatId, `Не смог обработать голосовое: ${escapeHtml(e.message)}`, {
      reply_markup: mainKeyboard(),
    });
  } finally {
    if (local) {
      try {
        unlinkSync(local);
      } catch {
        /* ignore */
      }
    }
  }
}

async function handleCallbackQuery(cq) {
  const chatId = cq.message?.chat?.id;
  const data = String(cq.data || '');
  if (chatId == null) return;

  const from = cq.from;
  if (!isAllowedOperator(from)) {
    try {
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Нет доступа',
        show_alert: true,
      });
    } catch {
      /* ignore */
    }
    return;
  }
  rememberTelegramUser(from);

  if (String(data).startsWith(CB_TASK_DEL_PREFIX)) {
    if (!isPrivateChat(cq.message?.chat) && !isGroupNotifyChat(chatId)) {
      try {
        await tg('answerCallbackQuery', {
          callback_query_id: cq.id,
          text: 'Нет доступа',
          show_alert: true,
        });
      } catch {
        /* ignore */
      }
      return;
    }
    const taskId = String(data).slice(CB_TASK_DEL_PREFIX.length).trim();
    try {
      if (taskId) await deleteYougileTask(taskId);
      const msgs = takeTaskMessages(taskId);
      if (cq.message?.message_id != null) {
        msgs.push({ chatId: String(chatId), messageId: cq.message.message_id });
      }
      for (const m of msgs) {
        await deleteTgMessage(m.chatId, m.messageId);
      }
      try {
        const state = loadState();
        if (state.tasks?.[taskId]) {
          delete state.tasks[taskId];
          writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
        }
      } catch {
        /* ignore */
      }
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Удалено из YouGile и чатов',
      });
    } catch (e) {
      console.error('task delete', e);
      try {
        await tg('answerCallbackQuery', {
          callback_query_id: cq.id,
          text: `Не удалось: ${e.message}`.slice(0, 180),
          show_alert: true,
        });
      } catch {
        /* ignore */
      }
    }
    return;
  }

  // Черновик / создание — только в личке
  if (!isPrivateChat(cq.message?.chat)) {
    try {
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Задачи создавай в личке с ботом',
        show_alert: true,
      });
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
  } catch {
    /* ignore */
  }

  const session = sessions.get(chatId);

  if (data === CB_CANCEL) {
    await dismissCallbackMessage(cq);
    await purgeEphemeral(chatId, { includeUser: true });
    sessions.delete(chatId);
    const ack = await reply(chatId, 'Ок, черновик отменил.', { reply_markup: mainKeyboard() });
    if (ack?.message_id != null) await deleteTgMessage(chatId, ack.message_id);
    return;
  }

  if (data === CB_CREATE) {
    // Сразу забираем черновик и снимаем кнопки — повторный клик не создаст дубль
    const draft = session?.draft;
    if (session?.step === 'creating' || !session) {
      await dismissCallbackMessage(cq);
      return;
    }
    if (!draft) {
      await dismissCallbackMessage(cq);
      await purgeEphemeral(chatId, { includeUser: true });
      sessions.delete(chatId);
      return;
    }
    sessions.set(chatId, { step: 'creating' });
    // Запоминаем id черновика на диске на случай рестарта, затем удаляем
    if (cq.message?.message_id) trackEphemeral(chatId, cq.message.message_id);
    await dismissCallbackMessage(cq);
    try {
      // Без «⏳ Создаю…» — в чате останется только финальный ✅
      await createFromDraft(chatId, draft);
    } catch (e) {
      console.error(e);
      await purgeEphemeral(chatId, { includeUser: true });
      sessions.delete(chatId);
      await reply(chatId, `Не удалось создать: ${escapeHtml(e.message)}`, {
        reply_markup: mainKeyboard(),
      });
    }
  }
}

export async function handleYougileUpdate(update) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return { ok: true, callback: true };
  }

  const msg = update.message || update.edited_message;
  if (!msg?.chat) return { ok: true, ignored: true };

  const chatId = msg.chat.id;
  const from = msg.from;

  // Группа — только уведомления; задачи создаём в личке @taneesh_yougile_bot
  if (!isPrivateChat(msg.chat)) {
    const text = String(msg.text || msg.caption || '').trim();
    const touched =
      /^\/(start|new|sync|cancel|help)(?:@\w+)?(?:\s|$)/i.test(text) ||
      text === BTN_NEW ||
      text === BTN_SYNC ||
      text === BTN_CANCEL ||
      Boolean(msg.voice || msg.audio || msg.video_note);
    if (touched && isGroupNotifyChat(chatId)) {
      await reply(
        chatId,
        '➡️ <b>Задачи — только в личке с ботом</b>\n' +
          '<a href="https://t.me/taneesh_yougile_bot">@taneesh_yougile_bot</a> → /start',
      );
    }
    return { ok: true, ignored: true, group: true };
  }

  if (!isAllowedOperator(from)) {
    await denyAccess(chatId);
    return { ok: true, denied: true };
  }
  rememberTelegramUser(from);

  const text = String(msg.text || msg.caption || '').trim();
  const session = sessions.get(chatId);

  // /start team|... 
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text) || text === '/help') {
    await handleStart(chatId, msg.message_id);
    return { ok: true };
  }

  if (msg.voice || msg.audio || msg.video_note) {
    await handleVoice(chatId, msg);
    return { ok: true, voice: true };
  }

  if (!text) return { ok: true, ignored: true };

  if (text === BTN_CANCEL || text === '/cancel') {
    trackUserMessage(chatId, msg.message_id);
    await purgeEphemeral(chatId, { includeUser: true });
    sessions.delete(chatId);
    const ack = await reply(chatId, 'Ок, отменил.', { reply_markup: mainKeyboard() });
    if (ack?.message_id != null) await deleteTgMessage(chatId, ack.message_id);
    return { ok: true };
  }

  if (text === BTN_SYNC || text === '/sync') {
    sessions.delete(chatId);
    await runSyncOnce(chatId, msg.message_id);
    return { ok: true };
  }

  if (text === BTN_NEW || text === '/new') {
    await beginCapture(chatId);
    trackUserMessage(chatId, msg.message_id);
    return { ok: true };
  }

  // Редактирование черновика или любой входящий текст → структура → превью
  if (session?.step === 'edit' || session?.step === 'await_input' || session?.step === 'preview') {
    try {
      trackUserMessage(chatId, msg.message_id);
      await ingestRawInput(chatId, text, {
        source: session?.draft?.source || 'Telegram',
        from,
      });
    } catch (e) {
      console.error(e);
      await reply(chatId, `Не удалось разобрать: ${escapeHtml(e.message)}`, {
        reply_markup: mainKeyboard(),
      });
    }
    return { ok: true };
  }

  if (!text.startsWith('/')) {
    try {
      trackUserMessage(chatId, msg.message_id);
      await ingestRawInput(chatId, text, { source: 'Telegram', from });
    } catch (e) {
      console.error(e);
      await reply(chatId, `Не удалось разобрать: ${escapeHtml(e.message)}`, {
        reply_markup: mainKeyboard(),
      });
    }
    return { ok: true };
  }

  await reply(chatId, 'Не понял команду. Жми /start', {
    reply_markup: mainKeyboard(),
  });
  return { ok: true };
}

export async function setupYougileBotWebhook(publicBaseUrl) {
  const token = env('YOUGILE_TELEGRAM_BOT_TOKEN');
  if (!token || !publicBaseUrl) return null;
  const url = `${publicBaseUrl.replace(/\/$/, '')}/yougile-bot/webhook`;
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      drop_pending_updates: false,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
  const data = await r.json();
  console.log('yougile bot webhook', url, data);
  return data;
}

export function yougileBotConfigured() {
  return Boolean(
    env('YOUGILE_TELEGRAM_BOT_TOKEN') &&
      env('YOUGILE_API_KEY') &&
      env('YOUGILE_COMPANY_ID') &&
      env('YOUGILE_PROJECT_ID'),
  );
}
