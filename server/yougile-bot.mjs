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

const CB_CREATE = 'draft:create';
const CB_EDIT = 'draft:edit';
const CB_CANCEL = 'draft:cancel';

/** Подсказки: что говорить, чтобы бот разложил по полям. */
const STRUCTURE_GUIDE =
  '<b>Структура задачи (Sandbox)</b>\n\n' +
  'Говори / пиши примерно так — можно минуту подряд, я разложу по блокам:\n\n' +
  '1. <b>Название</b> — одной фразой, что чиним / делаем\n' +
  '   <i>«Пуши по оплате не приходят в TestFlight»</i>\n\n' +
  '2. <b>Тип</b> — скажи явно:\n' +
  '   Баг · Доработка UI · Новая фича · Инфраструктура · B2B · Релиз · Аналитика\n\n' +
  '3. <b>Контекст</b> — где всплыло, кого касается, фон\n' +
  '   <i>«На созвоне с Рауфом, проявляется после склейки сборки…»</i>\n\n' +
  '4. <b>Как сейчас</b> — что ломается / как ведёт себя сейчас\n' +
  '   подсказки: <i>сейчас…, проблема в том, что…, не работает…</i>\n\n' +
  '5. <b>Как надо</b> — желаемый результат\n' +
  '   подсказки: <i>надо чтобы…, хотим…, должно…</i>\n\n' +
  '6. <b>Технически</b> — где копать, стек, кто\n' +
  '   подсказки: <i>технически…, на бэке…, в API…, Рашид / Рауф…</i>\n\n' +
  'Можно не по порядку — ключевые слова помогут. Потом покажу черновик: создать / изменить / отменить.';

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

function draftKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Создать задачу', callback_data: CB_CREATE }],
      [
        { text: '✏️ Изменить текст', callback_data: CB_EDIT },
        { text: '❌ Отменить', callback_data: CB_CANCEL },
      ],
    ],
  };
}

function dash(v) {
  const s = String(v || '').trim();
  return s || '—';
}

function formatDraftPreview(draft) {
  const cut = (s, n = 900) => {
    const t = dash(s);
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };
  return (
    '<b>📋 Черновик → Sandbox</b>\n' +
    '<i>Проверь и нажми кнопку ниже</i>\n\n' +
    `<b>Название:</b> ${escapeHtml(dash(draft.title))}\n\n` +
    `<b>Тип:</b> ${escapeHtml(dash(draft.type))}\n\n` +
    `<b>Контекст:</b>\n${escapeHtml(cut(draft.context))}\n\n` +
    `<b>Как сейчас:</b>\n${escapeHtml(cut(draft.asNow))}\n\n` +
    `<b>Как надо:</b>\n${escapeHtml(cut(draft.asShould))}\n\n` +
    `<b>Технически:</b>\n${escapeHtml(cut(draft.tech))}\n\n` +
    `<b>Источник:</b> ${escapeHtml(dash(draft.source))}`
  );
}

function buildTemplateDescription(draft) {
  const p = (label, value) =>
    `<p><b>${escapeHtml(label)}</b></p><p>${escapeHtml(dash(value)).replace(/\n/g, '<br/>')}</p>`;
  return (
    p('Тип', draft.type) +
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
    };
  }

  const labeled = {};
  // Порядок важен: сначала длинные фразы
  const labelNames =
    'название|заголовок|как сейчас|как надо|как должно|контекст|технически|техн\\.?|источник|тип|проблема|сейчас|надо';
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
  return {
    title,
    type: labeled.type || guessType(text),
    context: labeled.context || text,
    asNow: labeled.asNow || '—',
    asShould: labeled.asShould || '—',
    tech: labeled.tech || '—',
    source: labeled.source || source,
    raw: text,
  };
}

/** Optional LLM refine when OPENAI_API_KEY set. */
async function refineDraftWithOpenAI(draft) {
  const key = env('OPENAI_API_KEY');
  if (!key || !draft.raw) return draft;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env('OPENAI_STRUCTURE_MODEL', 'gpt-4o-mini'),
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Ты помощник Taneesh. Разложи текст задачи на JSON поля: title, type, context, asNow, asShould, tech. ' +
              'type — коротко (Баг, Доработка UI, Новая фича, Инфраструктура, B2B / ops, Релиз, Баг / аналитика, Уточнить). ' +
              'Пиши по-русски, без воды. Если поля нет — "—".',
          },
          { role: 'user', content: draft.raw },
        ],
      }),
    });
    if (!r.ok) return draft;
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw);
    return {
      ...draft,
      title: String(parsed.title || draft.title).slice(0, 200),
      type: String(parsed.type || draft.type),
      context: String(parsed.context || draft.context),
      asNow: String(parsed.asNow || draft.asNow),
      asShould: String(parsed.asShould || draft.asShould),
      tech: String(parsed.tech || draft.tech),
    };
  } catch (e) {
    console.error('refineDraft', e.message);
    return draft;
  }
}

async function handleStart(chatId) {
  sessions.delete(chatId);
  await reply(
    chatId,
    '<b>Taneesh YouGile</b>\n\n' +
      '• <b>Новая задача</b> — сначала структура, потом черновик с кнопками\n' +
      '• Текст или войсик → разбор по полям → <b>Создать / Изменить / Отменить</b>\n' +
      '• Всё падает в <b>Sandbox → Нераспределённое</b>, без авто-разноса\n\n' +
      STRUCTURE_GUIDE,
    { reply_markup: mainKeyboard() },
  );
}

async function beginCapture(chatId) {
  sessions.set(chatId, { step: 'await_input' });
  await reply(
    chatId,
    STRUCTURE_GUIDE +
      '\n\n⬇️ <b>Пришли текст или голосовое</b> — сначала покажу черновик, создам только после кнопки.',
    { reply_markup: cancelKeyboard() },
  );
}

async function showDraftPreview(chatId, draft) {
  sessions.set(chatId, { step: 'preview', draft });
  await reply(chatId, formatDraftPreview(draft), {
    reply_markup: draftKeyboard(),
  });
}

async function ingestRawInput(chatId, raw, { source = 'Telegram' } = {}) {
  await reply(chatId, '🧠 Раскладываю по структуре…');
  let draft = structureTaskFromText(raw, { source });
  draft = await refineDraftWithOpenAI(draft);
  await showDraftPreview(chatId, draft);
}

async function createFromDraft(chatId, draft) {
  const boards = await fetchBoards();
  const place = pickSandboxColumn(boards);
  const descHtml = buildTemplateDescription(draft);

  const task = await createYougileTask({
    title: draft.title.trim().slice(0, 200),
    descriptionHtml: descHtml,
    columnId: place.columnId,
  });

  rememberTaskInState(task, place.board, place.column);

  const html = formatCreateNotify({
    title: task.title || draft.title,
    code: task.idTaskProject || '',
    taskId: task.id,
    board: place.board,
    column: place.column,
    description: stripMarkerFromDesc(task.description || descHtml),
    assigneesText: 'не назначен',
  });

  const notify = await notifyGroup(html);
  const link = taskLink(env('YOUGILE_COMPANY_ID'), task.id);
  const notifyLine = notify.ok
    ? '📣 В группу отправил.'
    : `⚠️ Задача есть, но в группу не ушло: ${escapeHtml(notify.errors.join('; ') || 'нет chat_id')}`;

  sessions.delete(chatId);
  await reply(
    chatId,
    `✅ Создано: <b>${escapeHtml(task.idTaskProject || '')}</b> ${escapeHtml(task.title || draft.title)}\n` +
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
    await reply(
      chatId,
      `📝 Расшифровка:\n<i>${escapeHtml(transcript.slice(0, 1500))}</i>`,
    );
    await ingestRawInput(chatId, transcript, { source: 'Telegram · голосовое' });
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

async function handleCallbackQuery(cq) {
  const chatId = cq.message?.chat?.id;
  const data = String(cq.data || '');
  if (chatId == null) return;

  try {
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
  } catch {
    /* ignore */
  }

  const session = sessions.get(chatId);

  if (data === CB_CANCEL) {
    sessions.delete(chatId);
    await reply(chatId, 'Ок, черновик отменил.', { reply_markup: mainKeyboard() });
    return;
  }

  if (data === CB_EDIT) {
    const draft = session?.draft;
    sessions.set(chatId, { step: 'edit', draft });
    await reply(
      chatId,
      'Пришли <b>новый текст или голосовое</b> — пересоберу структуру.\n\n' + STRUCTURE_GUIDE,
      { reply_markup: cancelKeyboard() },
    );
    return;
  }

  if (data === CB_CREATE) {
    if (!session?.draft) {
      await reply(chatId, 'Черновик потерялся. Пришли текст/войсик ещё раз.', {
        reply_markup: mainKeyboard(),
      });
      return;
    }
    try {
      await reply(chatId, '⏳ Создаю в Sandbox…');
      await createFromDraft(chatId, session.draft);
    } catch (e) {
      console.error(e);
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
  const text = String(msg.text || msg.caption || '').trim();
  const session = sessions.get(chatId);

  if (msg.voice || msg.audio || msg.video_note) {
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
    await beginCapture(chatId);
    return { ok: true };
  }

  // Редактирование черновика или любой входящий текст → структура → превью
  if (session?.step === 'edit' || session?.step === 'await_input' || session?.step === 'preview') {
    try {
      await ingestRawInput(chatId, text, {
        source: session?.draft?.source || 'Telegram',
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
      // Сразу в превью; если человек не видел структуру — короткая подсказка уже была в /start
      await ingestRawInput(chatId, text, { source: 'Telegram' });
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
