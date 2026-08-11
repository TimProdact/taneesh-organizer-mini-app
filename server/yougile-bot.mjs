/**
 * @taneesh_yougile_bot — create YouGile tasks from Telegram + notify group.
 * Webhook: POST /yougile-bot/webhook
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = join(ROOT, '.yougile-notify-state.json');
const YG_API = 'https://ru.yougile.com/api-v2';

const BTN_NEW = '➕ Новая задача';
const BTN_SYNC = '🔄 Проверить YouGile';
const BTN_CANCEL = '❌ Отмена';

/** @type {Map<number, { step: string, title?: string }>} */
const sessions = new Map();

function env(name, fallback = '') {
  return process.env[name] || fallback;
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
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
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

function pickInboxColumn(boards) {
  const inbox = boards.Inbox || boards['Идеи со звонков'];
  if (!inbox) throw new Error('Inbox board not found');
  const cols = inbox.columns;
  for (const name of ['Нераспределённое', 'Бэклог', 'To Do']) {
    if (cols[name]) return { board: 'Inbox', column: name, columnId: cols[name] };
  }
  const [column, columnId] = Object.entries(cols)[0] || [];
  if (!columnId) throw new Error('Inbox has no columns');
  return { board: 'Inbox', column, columnId };
}

async function createYougileTask({ title, descriptionHtml, columnId, assigned }) {
  const body = {
    title,
    columnId,
    description: descriptionHtml,
  };
  if (assigned?.length) body.assigned = assigned;
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
  if (assigned?.length) {
    await fetch(`${YG_API}/tasks/${id}`, {
      method: 'PUT',
      headers: ygHeaders(),
      body: JSON.stringify({ assigned }),
    });
  }
  const full = await fetch(`${YG_API}/tasks/${id}`, { headers: ygHeaders() }).then((x) =>
    x.json(),
  );
  return full;
}

function formatCreateNotify({ title, code, taskId, board, column, description, assigneesText }) {
  const company = env('YOUGILE_COMPANY_ID');
  const head = code ? `<b>${escapeHtml(code)}</b> · ${escapeHtml(title)}` : `<b>${escapeHtml(title)}</b>`;
  let body = htmlToText(description);
  if (body.length > 2800) body = `${body.slice(0, 2800)}…`;
  return [
    '<b>Создание</b>',
    head,
    `${escapeHtml(board)} / ${escapeHtml(column)}`,
    '',
    `<b>Исполнитель:</b> ${assigneesText || 'не назначен'}`,
    '',
    '<b>Описание:</b>',
    escapeHtml(body || '—'),
    '',
    `<a href="${taskLink(company, taskId)}">Открыть в YouGile</a>`,
  ].join('\n');
}

function rememberTaskInState(task, board, column) {
  let state = { schema: 3, tasks: {} };
  try {
    if (existsSync(STATE_PATH)) state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    /* ignore */
  }
  if (!state.tasks) state.tasks = {};
  state.schema = 3;
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

async function notifyGroup(html) {
  const chatId = env('YOUGILE_TELEGRAM_CHAT_ID');
  if (!chatId) return;
  await reply(chatId, html);
}

async function handleStart(chatId) {
  sessions.delete(chatId);
  await reply(
    chatId,
    '<b>Taneesh YouGile</b>\n\n' +
      '• <b>Новая задача</b> — создаст карточку в Inbox → Нераспределённое и пришлёт пуш в группу\n' +
      '• <b>Проверить YouGile</b> — сразу сверит доски (переносы/удаления)\n\n' +
      'Или просто пришли текст — это станет названием задачи.',
    { reply_markup: mainKeyboard() },
  );
}

async function createFromText(chatId, title, description = '') {
  const boards = await fetchBoards();
  const place = pickInboxColumn(boards);
  const descHtml =
    (description
      ? `<p>${escapeHtml(description).replace(/\n/g, '<br/>')}</p>`
      : '<p></p>') + '<p data-tg-bot-created="1"></p>';

  const task = await createYougileTask({
    title: title.trim().slice(0, 200),
    descriptionHtml: descHtml,
    columnId: place.columnId,
  });

  rememberTaskInState(task, place.board, place.column);

  const html = formatCreateNotify({
    title: task.title || title,
    code: task.idTaskProject || '',
    taskId: task.id,
    board: place.board,
    column: place.column,
    description: task.description || description,
    assigneesText: 'не назначен',
  });
  await notifyGroup(html);

  const link = taskLink(env('YOUGILE_COMPANY_ID'), task.id);
  await reply(
    chatId,
    `✅ Создано: <b>${escapeHtml(task.idTaskProject || '')}</b> ${escapeHtml(task.title || title)}\n` +
      `${escapeHtml(place.board)} / ${escapeHtml(place.column)}\n` +
      `<a href="${link}">Открыть в YouGile</a>`,
    { reply_markup: mainKeyboard() },
  );
}

function loadState() {
  try {
    if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    /* ignore */
  }
  return { schema: 3, tasks: {} };
}

function saveState(state) {
  state.schema = 3;
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

/** Poll YouGile and push move/delete/new (skips bot-created). Returns sent count. */
export async function syncYougileOnce({ quietNew = false } = {}) {
  const state = loadState();
  const prev = state.tasks || {};
  const rebaseline = state.schema !== 3;
  if (rebaseline) quietNew = true;
  const snap = await snapshotAll();
  let sent = 0;

  for (const [tid, info] of Object.entries(snap)) {
    const old = prev[tid];
    if (!old) {
      if (!quietNew) {
        if (String(info.description || '').includes('data-tg-bot-created')) {
          continue;
        }
        let desc = info.description || '';
        if (!desc) {
          try {
            const full = await fetch(`${YG_API}/tasks/${tid}`, {
              headers: ygHeaders(),
            }).then((r) => r.json());
            desc = full.description || '';
          } catch {
            /* ignore */
          }
        }
        if (String(desc).includes('data-tg-bot-created')) continue;
        await notifyGroup(
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
        sent += 1;
      }
      continue;
    }
    const moved = old.columnId !== info.columnId || old.board !== info.board;
    if (moved) {
      const detail =
        old.board !== info.board
          ? `${old.board}/${old.column || '?'} → ${info.board}/${info.column}`
          : `${old.column || '?'} → ${info.column}`;
      await notifyGroup(
        formatActionNotify({
          action: 'Перенос',
          title: info.title,
          code: info.code || old.code || '',
          taskId: tid,
          board: info.board,
          detail,
        }),
      );
      sent += 1;
    }
  }

  if (!quietNew) {
    for (const [tid, old] of Object.entries(prev)) {
      if (snap[tid]) continue;
      await notifyGroup(
        formatActionNotify({
          action: 'Удаление',
          title: old.title || 'без названия',
          code: old.code || '',
          taskId: tid,
          board: old.board || '',
          detail: old.column || '',
        }),
      );
      sent += 1;
    }
  }

  const next = { schema: 3, tasks: {} };
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

async function runSyncOnce(chatId) {
  await reply(chatId, '🔄 Проверяю YouGile…');
  try {
    const n = await syncYougileOnce({ quietNew: false });
    await reply(chatId, `Готово. Отправлено уведомлений: <b>${n}</b>`, {
      reply_markup: mainKeyboard(),
    });
  } catch (e) {
    console.error(e);
    await reply(chatId, `Ошибка синка: ${escapeHtml(e.message)}`, {
      reply_markup: mainKeyboard(),
    });
  }
}

export function startYougilePolling(intervalMs = 60_000) {
  if (!yougileBotConfigured()) return;
  const tick = async () => {
    try {
      const n = await syncYougileOnce({ quietNew: false });
      if (n) console.log('yougile poll sent', n);
    } catch (e) {
      console.error('yougile poll', e.message);
    }
  };
  // baseline first without flood
  syncYougileOnce({ quietNew: true })
    .then(() => console.log('yougile poll baselined'))
    .catch((e) => console.error('yougile baseline', e.message));
  setInterval(tick, intervalMs);
}

export async function handleYougileUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg?.chat || !msg.text) return { ok: true, ignored: true };

  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const session = sessions.get(chatId);

  if (text === '/start' || text === '/help') {
    await handleStart(chatId);
    return { ok: true };
  }

  if (text === BTN_CANCEL || text === '/cancel') {
    sessions.delete(chatId);
    await reply(chatId, 'Ок, отменил.', { reply_markup: mainKeyboard() });
    return { ok: true };
  }

  if (text === BTN_SYNC || text === '/sync') {
    sessions.delete(chatId);
    await runSyncOnce(chatId);
    return { ok: true };
  }

  if (text === BTN_NEW || text === '/new') {
    sessions.set(chatId, { step: 'title' });
    await reply(chatId, 'Напиши <b>название</b> задачи:', {
      reply_markup: cancelKeyboard(),
    });
    return { ok: true };
  }

  if (session?.step === 'title') {
    sessions.set(chatId, { step: 'desc', title: text });
    await reply(
      chatId,
      'Название принял. Теперь <b>описание</b> (или «-» / «без описания»):',
      { reply_markup: cancelKeyboard() },
    );
    return { ok: true };
  }

  if (session?.step === 'desc') {
    const title = session.title || text;
    const desc =
      text === '-' || /^без\s*описан/i.test(text) || text === '—' ? '' : text;
    sessions.delete(chatId);
    try {
      await createFromText(chatId, title, desc);
    } catch (e) {
      console.error(e);
      await reply(chatId, `Не удалось создать: ${escapeHtml(e.message)}`, {
        reply_markup: mainKeyboard(),
      });
    }
    return { ok: true };
  }

  // Fast path: plain text → create task with empty description
  if (!text.startsWith('/')) {
    try {
      await createFromText(chatId, text, '');
    } catch (e) {
      console.error(e);
      await reply(chatId, `Не удалось создать: ${escapeHtml(e.message)}`, {
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
    body: JSON.stringify({ url, drop_pending_updates: false }),
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
