/**
 * @taneesh_yougile_bot — create YouGile tasks from Telegram + notify group.
 * Webhook: POST /yougile-bot/webhook
 *
 * Env:
 *   YOUGILE_API_KEY, YOUGILE_COMPANY_ID, YOUGILE_PROJECT_ID
 *   YOUGILE_TELEGRAM_BOT_TOKEN
 *   YOUGILE_TELEGRAM_CHAT_ID   — основная группа (можно несколько через запятую)
 *   OPENAI_API_KEY             — Whisper для голосовых (опционально; иначе local whisper)
 *   YOUGILE_NOTIFY_THREAD_ID   — topic id, если группа-форум
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

/** @type {Map<number, { step: string, title?: string }>} */
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

function notifyChatIds() {
  const raw = env('YOUGILE_TELEGRAM_CHAT_ID');
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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
    // HTML мог сломаться — шлём plain
    console.error('reply HTML failed, plain fallback', e.message);
    const { parse_mode: _p, ...rest } = payload;
    return tg('sendMessage', { ...rest, text: htmlToText(text) });
  }
}

/**
 * Always try to deliver to every configured group chat.
 * Retries + plain-text fallback. Returns { ok, sent, errors }.
 */
async function notifyGroup(html, { alsoChatId } = {}) {
  const ids = new Set(notifyChatIds());
  if (alsoChatId != null) ids.add(String(alsoChatId));
  if (!ids.size) {
    console.error('notifyGroup: no YOUGILE_TELEGRAM_CHAT_ID');
    return { ok: false, sent: 0, errors: ['no chat id'] };
  }

  const threadId = env('YOUGILE_NOTIFY_THREAD_ID');
  const plain = htmlToText(html);
  let sent = 0;
  const errors = [];

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
        await tg('sendMessage', body);
        delivered = true;
        sent += 1;
      } catch (e1) {
        try {
          const body = {
            chat_id: chatId,
            text: plain.slice(0, 4000),
            disable_web_page_preview: true,
          };
          if (threadId) body.message_thread_id = Number(threadId);
          await tg('sendMessage', body);
          delivered = true;
          sent += 1;
        } catch (e2) {
          console.error(`notifyGroup chat=${chatId} attempt=${attempt}`, e1.message, e2.message);
          if (attempt === 3) errors.push(`${chatId}: ${e2.message}`);
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }
  }

  if (!sent) console.error('notifyGroup FAILED', errors);
  else console.log('notifyGroup sent', sent, 'chats', [...ids].join(','));
  return { ok: sent > 0, sent, errors };
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
  for (const name of ['Нераспределённое', 'Бэклог', 'To Do', 'Inbox']) {
    if (cols[name]) return { board: boardName || 'Sandbox', column: name, columnId: cols[name] };
  }
  const [column, columnId] = Object.entries(cols)[0] || [];
  if (!columnId) throw new Error('Sandbox has no columns');
  return { board: boardName || 'Sandbox', column, columnId };
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
  let body = htmlToText(stripMarkerFromDesc(description));
  if (body.length > 2800) body = `${body.slice(0, 2800)}…`;
  return [
    '<b>Создание</b>',
    head,
    `${escapeHtml(board)} / ${escapeHtml(column)}`,
    '',
    `<b>Исполнитель:</b> ${escapeHtml(assigneesText || 'не назначен')}`,
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

async function handleStart(chatId) {
  sessions.delete(chatId);
  await reply(
    chatId,
    '<b>Taneesh YouGile</b>\n\n' +
      '• <b>Новая задача</b> — карточка в Sandbox → Нераспределённое + пуш в группу\n' +
      '• <b>Голосовое</b> — расшифрую и создам по шаблону в Sandbox\n' +
      '• <b>Проверить YouGile</b> — сверка переносов/удалений\n\n' +
      'Или просто пришли текст / войсик — это станет задачей.',
    { reply_markup: mainKeyboard() },
  );
}

/** Title = first sentence / line; rest goes to description body. */
export function parseVoiceToTask(transcript) {
  const text = String(transcript || '').replace(/\s+/g, ' ').trim();
  if (!text) return { title: 'Голосовая задача', body: '' };

  const sentenceMatch = text.match(/^(.{8,160}?[.!?…])(\s|$)/u);
  const lineMatch = text.split(/\n/)[0];
  let title = (sentenceMatch?.[1] || lineMatch || text).trim();
  if (title.length > 120) title = `${title.slice(0, 117)}…`;
  const body = text === title ? text : text;
  return { title, body };
}

function buildTemplateDescription({ body, source = 'Telegram', type = 'Из голоса / уточнить' }) {
  const safeBody = escapeHtml(body || '—').replace(/\n/g, '<br/>');
  return (
    `<p><b>Тип</b></p><p>${escapeHtml(type)}</p>` +
    `<p><b>Контекст</b></p><p>${safeBody}</p>` +
    `<p><b>Как сейчас</b></p><p>—</p>` +
    `<p><b>Как надо</b></p><p>—</p>` +
    `<p><b>Технически</b></p><p>—</p>` +
    `<p><b>Источник</b></p><p>${escapeHtml(source)}</p>` +
    `<p>#${MARKER}</p>`
  );
}

async function createFromText(chatId, title, description = '', { fromVoice = false, transcript = '' } = {}) {
  const boards = await fetchBoards();
  const place = pickSandboxColumn(boards);

  let descHtml;
  if (fromVoice) {
    descHtml = buildTemplateDescription({
      body: transcript || description,
      source: 'Telegram · голосовое',
      type: 'Из голоса / уточнить',
    });
  } else if (description) {
    descHtml =
      `<p>${escapeHtml(description).replace(/\n/g, '<br/>')}</p>` +
      `<p><b>Источник</b></p><p>Telegram</p>` +
      `<p>#${MARKER}</p>`;
  } else {
    descHtml =
      `<p></p><p><b>Источник</b></p><p>Telegram</p><p>#${MARKER}</p>`;
  }

  const task = await createYougileTask({
    title: title.trim().slice(0, 200),
    descriptionHtml: descHtml,
    columnId: place.columnId,
  });

  // В state ДО пуша — poll не задвоит «Создание»
  rememberTaskInState(task, place.board, place.column);

  const html = formatCreateNotify({
    title: task.title || title,
    code: task.idTaskProject || '',
    taskId: task.id,
    board: place.board,
    column: place.column,
    description: stripMarkerFromDesc(task.description || descHtml),
    assigneesText: 'не назначен',
  });

  const notify = await notifyGroup(html);
  // Если юзер писал не из группы — дублируем пуш ему не нужно (уже reply ниже).
  // Если писали из другого чата и группа не приняла — скажем явно.

  const link = taskLink(env('YOUGILE_COMPANY_ID'), task.id);
  const notifyLine = notify.ok
    ? '📣 В группу отправил.'
    : `⚠️ Задача есть, но в группу не ушло: ${escapeHtml(notify.errors.join('; ') || 'нет chat_id')}`;

  await reply(
    chatId,
    `✅ Создано: <b>${escapeHtml(task.idTaskProject || '')}</b> ${escapeHtml(task.title || title)}\n` +
      `${escapeHtml(place.board)} / ${escapeHtml(place.column)}\n` +
      `${notifyLine}\n` +
      `<a href="${link}">Открыть в YouGile</a>`,
    { reply_markup: mainKeyboard() },
  );

  return { task, notify };
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

function isBotCreatedDesc(desc) {
  return String(desc || '').includes(MARKER) || String(desc || '').includes('data-tg-bot-created');
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
        if (isBotCreatedDesc(desc)) {
          continue;
        }
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
      continue;
    }
    const moved = old.columnId !== info.columnId || old.board !== info.board;
    if (moved) {
      const detail =
        old.board !== info.board
          ? `${old.board}/${old.column || '?'} → ${info.board}/${info.column}`
          : `${old.column || '?'} → ${info.column}`;
      const n = await notifyGroup(
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
  }

  if (!quietNew) {
    for (const [tid, old] of Object.entries(prev)) {
      if (snap[tid]) continue;
      const n = await notifyGroup(
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
  const openai = await transcribeWithOpenAI(filePath);
  if (openai) return openai;
  const local = await transcribeWithLocalWhisper(filePath);
  if (local) return local;
  throw new Error(
    'Нет расшифровки: добавь OPENAI_API_KEY в .env или установи python-пакет openai-whisper',
  );
}

async function handleVoice(chatId, msg) {
  const voice = msg.voice || msg.audio || msg.video_note;
  if (!voice?.file_id) {
    await reply(chatId, 'Не нашёл аудио в сообщении.', { reply_markup: mainKeyboard() });
    return;
  }
  await reply(chatId, '🎤 Слушаю и расшифровываю…');
  let local;
  try {
    local = await downloadTelegramFile(voice.file_id);
    const transcript = await transcribeVoiceFile(local);
    if (!transcript) throw new Error('Пустая расшифровка');
    const { title, body } = parseVoiceToTask(transcript);
    await reply(
      chatId,
      `📝 Расшифровка:\n<i>${escapeHtml(transcript.slice(0, 1500))}</i>\n\nСоздаю в Sandbox…`,
    );
    await createFromText(chatId, title, body, { fromVoice: true, transcript: body });
  } catch (e) {
    console.error('voice', e);
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

export async function handleYougileUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg?.chat) return { ok: true, ignored: true };

  const chatId = msg.chat.id;
  const text = String(msg.text || msg.caption || '').trim();
  const session = sessions.get(chatId);

  if (msg.voice || msg.audio || msg.video_note) {
    // В визарде «описание» — войсик только как текст описания
    if (session?.step === 'desc' && session.title) {
      await reply(chatId, '🎤 Расшифровываю описание…');
      let local;
      try {
        const voice = msg.voice || msg.audio || msg.video_note;
        local = await downloadTelegramFile(voice.file_id);
        const transcript = await transcribeVoiceFile(local);
        sessions.delete(chatId);
        await createFromText(chatId, session.title, transcript);
      } catch (e) {
        console.error(e);
        await reply(chatId, `Не удалось: ${escapeHtml(e.message)}`, {
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
      return { ok: true, voice: true };
    }
    sessions.delete(chatId);
    await handleVoice(chatId, msg);
    return { ok: true, voice: true };
  }

  if (!text) return { ok: true, ignored: true };

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
    await reply(chatId, 'Напиши <b>название</b> задачи (или пришли голосовое):', {
      reply_markup: cancelKeyboard(),
    });
    return { ok: true };
  }

  if (session?.step === 'title') {
    sessions.set(chatId, { step: 'desc', title: text });
    await reply(
      chatId,
      'Название принял. Теперь <b>описание</b> (или «-» / «без описания» / голосовое):',
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
