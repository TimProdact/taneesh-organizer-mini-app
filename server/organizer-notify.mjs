/**
 * Telegram-уведомления только организатору (@taneesh_organizer_bot).
 * Гостю ничего не уходит. Кнопка «Открыть» ведёт в кабинет (hash / ?go=).
 */
import { listOrganizerTelegramIds } from './organizer-store.mjs';

export const ORGANIZER_NOTIFY_TYPES = [
  'event.submitted',
  'event.approved',
  'event.rejected',
  'event.hidden',
  'event.cancelled',
  'kyc.pending',
  'kyc.approved',
  'kyc.rejected',
  'payout.sent',
  'payout.failed',
  'billing.invoice',
  'plan.limit',
  'attendee.approval_needed',
  'refund.requested',
  'sale.sold_out',
  'sales.started',
  'sales.digest',
  'hold.cancelled',
  'controller.added',
  'event.starts_soon',
  'maintenance',
  'legal.updated',
];

const TYPE_SET = new Set(ORGANIZER_NOTIFY_TYPES);

/** Эти типы можно слать без initData (гость оформил заявку / распродано) — получатель всё равно только granted organizer. */
const PUBLIC_TRIGGER_TYPES = new Set([
  'attendee.approval_needed',
  'sale.sold_out',
  'refund.requested',
  'sales.started',
  'sales.digest',
]);

const LEGAL_TYPE_LABEL = {
  LLC: 'Юрлицо (ООО)',
  IE: 'ИП',
  SelfEmployed: 'Самозанятый',
  Individual: 'Физлицо',
  JSC: 'АО',
};

const sentKeys = new Set();
const digestByTelegram = new Map();
let lastDigestFlushAt = 0;

function token() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

function cabinetBase() {
  const raw =
    process.env.ORGANIZER_CABINET_URL || 'https://timprodact.github.io/taneesh-org-app/';
  return raw.replace(/\?.*$/, '').replace(/\/+$/, '') + '/';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatMoneyUzs(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${n.toLocaleString('ru-RU').replace(/\u00A0/g, ' ')} UZS`;
}

function str(payload, key, fallback = '') {
  const v = payload?.[key];
  if (v == null || v === '') return fallback;
  return String(v);
}

export function cabinetHashFor(type, payload = {}) {
  const eventId = str(payload, 'eventId');
  switch (type) {
    case 'event.submitted':
      return eventId ? `#/events/${encodeURIComponent(eventId)}` : '#/events';
    case 'event.approved':
    case 'event.hidden':
    case 'sales.started':
    case 'sale.sold_out':
      return eventId ? `#/events/${encodeURIComponent(eventId)}` : '#/events';
    case 'event.rejected':
      return eventId ? `#/events/${encodeURIComponent(eventId)}/edit` : '#/events';
    case 'event.cancelled':
    case 'refund.requested':
    case 'hold.cancelled':
      return eventId ? `#/events/${encodeURIComponent(eventId)}/sales` : '#/profile/payouts';
    case 'kyc.pending':
    case 'kyc.approved':
    case 'kyc.rejected':
      return '#/profile/requisites';
    case 'payout.sent':
    case 'payout.failed':
    case 'sales.digest':
      return '#/profile/payouts';
    case 'billing.invoice':
      return '#/profile/documents';
    case 'plan.limit':
      return '#/events';
    case 'attendee.approval_needed':
      return eventId ? `#/events/${encodeURIComponent(eventId)}/attendees` : '#/events';
    case 'controller.added':
      return '#/profile/controllers';
    case 'event.starts_soon':
      return eventId ? `#/events/${encodeURIComponent(eventId)}/scan` : '#/scan';
    case 'maintenance':
    case 'legal.updated':
      return '#/profile/documents';
    default:
      return '#/events';
  }
}

export function cabinetOpenUrl(hash) {
  const path = String(hash || '#/events')
    .replace(/^#/, '')
    .replace(/^\/+/, '');
  const u = new URL(cabinetBase());
  u.searchParams.set('go', path);
  u.hash = `/${path}`;
  return u.toString();
}

function kycTypeLabel(payload) {
  const raw = str(payload, 'kycType') || str(payload, 'type');
  return LEGAL_TYPE_LABEL[raw] || raw || 'анкета';
}

function fileList(payload) {
  const files = payload?.files || payload?.documentFileNames || payload?.documentEntries;
  if (Array.isArray(files) && files.length) {
    return files
      .map((f) => (typeof f === 'string' ? f : f?.fileName || f?.label || ''))
      .filter(Boolean)
      .join(', ');
  }
  return str(payload, 'filesLabel');
}

export function buildNotifyText(type, payload = {}) {
  const title = str(payload, 'eventTitle') || str(payload, 'title') || str(payload, 'name');
  const reason = str(payload, 'reason') || str(payload, 'comment') || str(payload, 'adminComment');
  const amount = payload?.amount != null ? formatMoneyUzs(payload.amount) : '';

  switch (type) {
    case 'event.submitted':
      return `<b>На модерации</b>\n«${escapeHtml(title)}» отправлено на проверку.`;
    case 'event.approved': {
      const page = str(payload, 'publicUrl');
      const link = page ? `\nСтраница: ${escapeHtml(page)}` : '';
      return `<b>Опубликовано</b>\n«${escapeHtml(title)}» прошло модерацию и доступно гостям.${link}`;
    }
    case 'event.rejected':
      return `<b>Отклонено</b>\n«${escapeHtml(title)}».\nПричина: ${escapeHtml(reason || 'не указана')}.`;
    case 'event.hidden':
      return `<b>Снято с публикации</b>\n«${escapeHtml(title)}».\nПричина: ${escapeHtml(reason || 'не указана')}.`;
    case 'event.cancelled':
      return (
        `<b>Событие отменено</b>\n«${escapeHtml(title)}».\n` +
        'Холды сами не снимаются — отмените их по одному в платежах события.'
      );
    case 'kyc.pending':
      return `<b>Документы на проверке</b>\nАнкета: ${escapeHtml(kycTypeLabel(payload))}. Обычно до 24 часов.`;
    case 'kyc.approved':
      return '<b>Верификация пройдена</b>\nМожно публиковать платные события и выводить средства.';
    case 'kyc.rejected': {
      const files = fileList(payload);
      const filesLine = files ? `\nФайлы: ${escapeHtml(files)}.` : '';
      return `<b>Верификация отклонена</b>\nПричина: ${escapeHtml(reason || 'не указана')}.${filesLine}`;
    }
    case 'payout.sent': {
      const period = str(payload, 'period') || str(payload, 'eventTitle');
      const eta = str(payload, 'eta') || 'до 1 рабочего дня';
      const where = period ? ` · ${escapeHtml(period)}` : '';
      return `<b>Выплата отправлена</b>\n${escapeHtml(amount || 'сумма')} на ваши реквизиты${where}.\nСрок зачисления: ${escapeHtml(eta)}.`;
    }
    case 'payout.failed': {
      const err = str(payload, 'error') || reason || 'не удалось зачислить';
      return `<b>Выплата не прошла</b>\n${escapeHtml(amount || 'сумма')}.\nОшибка: ${escapeHtml(err)}.`;
    }
    case 'billing.invoice': {
      const num = str(payload, 'invoiceNumber') || str(payload, 'number');
      const due = str(payload, 'due') || str(payload, 'dueAt');
      const dueLine = due ? `\nСрок: ${escapeHtml(due)}.` : '';
      return `<b>Новый счёт</b>\n${escapeHtml(num || 'счёт')} · ${escapeHtml(amount || '')}.${dueLine}`;
    }
    case 'plan.limit':
      return (
        `<b>Лимит тарифа</b>\n${escapeHtml(str(payload, 'blocked') || 'Действие недоступно на текущем тарифе.')}`
      );
    case 'attendee.approval_needed': {
      const guest = str(payload, 'guestName') || str(payload, 'name');
      const phone = str(payload, 'phone') || str(payload, 'contact');
      const phoneLine = phone ? `, ${escapeHtml(phone)}` : '';
      return `<b>Новая заявка</b>\n${escapeHtml(guest || 'Гость')}${phoneLine}\n«${escapeHtml(title)}» — нужно подтверждение.`;
    }
    case 'refund.requested': {
      const guest = str(payload, 'guestName') || str(payload, 'name');
      return `<b>Запрос на возврат</b>\n«${escapeHtml(title)}» · ${escapeHtml(amount || '')}\nГость: ${escapeHtml(guest || '—')}.`;
    }
    case 'sale.sold_out': {
      const tariff = str(payload, 'ticketName') || str(payload, 'tariff');
      const what = tariff ? `Тариф «${escapeHtml(tariff)}»` : 'Событие';
      return `<b>Распродано</b>\n${what} — «${escapeHtml(title)}».`;
    }
    case 'sales.started':
      return `<b>Старт продаж</b>\n«${escapeHtml(title)}» — билеты доступны по расписанию.`;
    case 'sales.digest': {
      const tickets = Number(payload?.tickets) || 0;
      const money = payload?.amount != null ? formatMoneyUzs(payload.amount) : '';
      return `<b>Продажи за час</b>\n+${tickets} билетов${money ? `, ${escapeHtml(money)}` : ''}.`;
    }
    case 'hold.cancelled': {
      const guest = str(payload, 'guestName') || str(payload, 'name');
      return `<b>Холд снят</b>\n${escapeHtml(amount || '')} · ${escapeHtml(guest || 'гость')}\n«${escapeHtml(title)}».`;
    }
    case 'controller.added': {
      const name = str(payload, 'controllerName') || str(payload, 'name');
      const phone = str(payload, 'phone');
      const phoneLine = phone ? `, ${escapeHtml(phone)}` : '';
      return `<b>Контролёр добавлен</b>\n${escapeHtml(name || 'Сканировщик')}${phoneLine}.`;
    }
    case 'event.starts_soon': {
      const when = str(payload, 'startsAtLabel') || str(payload, 'time');
      const whenLine = when ? `\nНачало: ${escapeHtml(when)}.` : '';
      return `<b>Скоро начало</b>\n«${escapeHtml(title)}».${whenLine}`;
    }
    case 'maintenance': {
      const when = str(payload, 'window') || str(payload, 'text');
      return `<b>Плановые работы</b>\n${escapeHtml(when || 'Кабинет организатора будет временно недоступен.')}`;
    }
    case 'legal.updated':
      return `<b>Документы обновились</b>\n${escapeHtml(str(payload, 'text') || 'Нужно принять оферту и новые документы в профиле.')}`;
    default:
      return escapeHtml(str(payload, 'text') || type);
  }
}

function idempotencyKey({ type, entityId, telegramId, key }) {
  if (key) return String(key);
  return `${type}:${entityId || 'na'}:${telegramId}`;
}

async function telegramSendMessage({ chatId, text, url }) {
  const bot = token();
  if (!bot) {
    console.warn('[organizer-notify] TELEGRAM_BOT_TOKEN missing — skip');
    return { ok: false, error: 'no_token' };
  }
  const res = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть', web_app: { url } }]],
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    console.warn('[organizer-notify] sendMessage', chatId, data.description || res.status);
  }
  return data;
}

export function isOrganizerNotifyType(type) {
  return TYPE_SET.has(String(type || ''));
}

export function isPublicNotifyTrigger(type) {
  return PUBLIC_TRIGGER_TYPES.has(String(type || ''));
}

/**
 * Отправка только на telegram_id организатора (granted). Гостевые chat_id отбрасываются.
 */
export async function notifyOrganizer({
  type,
  telegramId,
  payload = {},
  entityId,
  hash,
  idempotency_key,
  idempotencyKey: idemKey,
} = {}) {
  const t = String(type || '');
  if (!TYPE_SET.has(t)) {
    return { ok: false, error: 'unknown_type', skipped: true };
  }

  const granted = await listOrganizerTelegramIds();
  const grantedSet = new Set(granted);
  let recipients = [];
  if (telegramId != null && telegramId !== '') {
    const id = Number(telegramId);
    if (grantedSet.has(id)) recipients = [id];
  } else {
    recipients = granted;
  }

  if (!recipients.length) {
    console.warn('[organizer-notify] no organizer telegram_id', t);
    return { ok: false, error: 'no_recipient', skipped: true };
  }

  const text = buildNotifyText(t, payload);
  const openHash = hash || cabinetHashFor(t, { ...payload, eventId: payload.eventId || entityId });
  const url = cabinetOpenUrl(openHash);
  const results = [];

  for (const id of recipients) {
    const key = idempotencyKey({
      type: t,
      entityId: entityId || payload.eventId || payload.id,
      telegramId: id,
      key: idempotency_key || idemKey,
    });
    if (sentKeys.has(key)) {
      results.push({ telegramId: id, ok: true, duplicate: true, idempotency_key: key });
      continue;
    }
    const sent = await telegramSendMessage({ chatId: id, text, url });
    if (sent.ok) sentKeys.add(key);
    results.push({
      telegramId: id,
      ok: Boolean(sent.ok),
      error: sent.description || sent.error,
      idempotency_key: key,
    });
  }

  return { ok: results.some((r) => r.ok && !r.duplicate), results };
}

export function recordSaleForDigest(telegramId, { tickets = 1, amount = 0 } = {}) {
  const id = Number(telegramId);
  if (!Number.isFinite(id) || id <= 0) return;
  const prev = digestByTelegram.get(id) || { tickets: 0, amount: 0, since: Date.now() };
  digestByTelegram.set(id, {
    tickets: prev.tickets + Math.max(0, Number(tickets) || 0),
    amount: prev.amount + Math.max(0, Number(amount) || 0),
    since: prev.since,
  });
}

export async function flushSalesDigests({ minIntervalMs = 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  if (now - lastDigestFlushAt < minIntervalMs) return { ok: true, skipped: true };
  lastDigestFlushAt = now;
  const entries = [...digestByTelegram.entries()];
  digestByTelegram.clear();
  let sent = 0;
  for (const [telegramId, bucket] of entries) {
    if (!bucket.tickets && !bucket.amount) continue;
    const hour = new Date(now).toISOString().slice(0, 13);
    const res = await notifyOrganizer({
      type: 'sales.digest',
      telegramId,
      payload: { tickets: bucket.tickets, amount: bucket.amount },
      entityId: hour,
      idempotency_key: `sales.digest:${hour}:${telegramId}`,
    });
    if (res.ok) sent += 1;
  }
  return { ok: true, sent };
}

function hoursUntil(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / 3600_000;
}

function formatStartsAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
}

/**
 * event.starts_soon (2–24 ч), sales.started, hourly sales.digest.
 * Не шлёт sale.paid и не шлёт каждый скан.
 */
export async function tickOrganizerSchedule(snapshot) {
  const events = snapshot?.events || [];
  const recipients = await listOrganizerTelegramIds();
  const telegramId = recipients[0];

  for (const event of events) {
    const eventId = event.id;
    const title = event.name || event.title;
    const startsAt = event.startsAt;
    const hrs = startsAt ? hoursUntil(startsAt) : null;
    if (hrs != null && hrs >= 2 && hrs <= 24) {
      await notifyOrganizer({
        type: 'event.starts_soon',
        telegramId,
        payload: { eventId, eventTitle: title, startsAtLabel: formatStartsAt(startsAt) },
        entityId: eventId,
      });
    }

    const tickets = event.tickets || [];
    const eventStart = event.salesStartDatetime;
    const starts = [
      eventStart,
      ...tickets.map((t) => t.salesStartDatetime).filter(Boolean),
    ].filter(Boolean);
    for (const iso of starts) {
      const h = hoursUntil(iso);
      if (h == null) continue;
      if (h <= 0 && h > -1) {
        const ticket = tickets.find((t) => t.salesStartDatetime === iso);
        await notifyOrganizer({
          type: 'sales.started',
          telegramId,
          payload: {
            eventId,
            eventTitle: title,
            ticketName: ticket?.name,
          },
          entityId: `${eventId}:${iso}`,
        });
      }
    }
  }

  await flushSalesDigests();
  return { ok: true };
}

export async function notifyAfterStoreAction({
  adminAction,
  payload = {},
  telegramId,
  event,
  profile,
  controller,
  extra = {},
} = {}) {
  const ctx = { telegramId };
  const eventId = event?.id || payload.eventId;
  const eventTitle = event?.name || event?.title || payload.name;

  switch (adminAction) {
    case 'create_event':
    case 'submit_event':
      if (event?.status === 'on_moderation' || event?.status === 'pending' || adminAction === 'submit_event') {
        return notifyOrganizer({
          type: 'event.submitted',
          ...ctx,
          payload: { eventId, eventTitle },
          entityId: eventId,
        });
      }
      return { skipped: true };
    case 'publish_event':
    case 'moderate_event':
      if (payload.status === 'published' || adminAction === 'publish_event') {
        return notifyOrganizer({
          type: 'event.approved',
          ...ctx,
          payload: { eventId, eventTitle, publicUrl: extra.publicUrl },
          entityId: eventId,
        });
      }
      if (payload.status === 'rejected') {
        return notifyOrganizer({
          type: 'event.rejected',
          ...ctx,
          payload: { eventId, eventTitle, reason: payload.comment || payload.reason },
          entityId: eventId,
        });
      }
      if (payload.status === 'hidden') {
        return notifyOrganizer({
          type: 'event.hidden',
          ...ctx,
          payload: { eventId, eventTitle, reason: payload.comment || payload.reason },
          entityId: eventId,
        });
      }
      if (payload.status === 'cancelled') {
        return notifyOrganizer({
          type: 'event.cancelled',
          ...ctx,
          payload: { eventId, eventTitle },
          entityId: eventId,
        });
      }
      if (payload.status === 'on_moderation' || payload.status === 'pending') {
        return notifyOrganizer({
          type: 'event.submitted',
          ...ctx,
          payload: { eventId, eventTitle },
          entityId: eventId,
        });
      }
      return { skipped: true };
    case 'set_event_visible':
      if (payload.visible === false) {
        return notifyOrganizer({
          type: 'event.hidden',
          ...ctx,
          payload: { eventId, eventTitle, reason: payload.comment || payload.reason },
          entityId: eventId,
        });
      }
      return { skipped: true };
    case 'cancel_event':
      return notifyOrganizer({
        type: 'event.cancelled',
        ...ctx,
        payload: { eventId, eventTitle },
        entityId: eventId,
      });
    case 'submit_kyc':
      return notifyOrganizer({
        type: 'kyc.pending',
        ...ctx,
        payload: { kycType: payload.type || payload.kycType || profile?.legalType },
        entityId: `kyc:${telegramId || 'org'}`,
      });
    case 'set_kyc_status':
      if (payload.status === 'approved') {
        return notifyOrganizer({
          type: 'kyc.approved',
          ...ctx,
          payload: {},
          entityId: `kyc-ok:${telegramId || 'org'}`,
        });
      }
      if (payload.status === 'rejected') {
        return notifyOrganizer({
          type: 'kyc.rejected',
          ...ctx,
          payload: {
            reason: payload.reason || payload.adminComment,
            files: payload.files || payload.documentFileNames,
          },
          entityId: `kyc-no:${telegramId || 'org'}:${payload.reason || Date.now()}`,
        });
      }
      if (payload.status === 'pending') {
        return notifyOrganizer({
          type: 'kyc.pending',
          ...ctx,
          payload: { kycType: payload.type || payload.kycType },
          entityId: `kyc:${telegramId || 'org'}`,
        });
      }
      return { skipped: true };
    case 'add_controller':
      return notifyOrganizer({
        type: 'controller.added',
        ...ctx,
        payload: {
          controllerName: controller?.name || payload.name,
          phone: controller?.phone || payload.phone,
        },
        entityId: controller?.id || payload.phoneNational || payload.name,
      });
    case 'register_attendee':
      return notifyOrganizer({
        type: 'attendee.approval_needed',
        ...ctx,
        payload: {
          eventId,
          eventTitle,
          guestName: payload.name,
          phone: payload.contact || payload.phone,
        },
        entityId: payload.attendeeId || payload.contact || payload.phone,
      });
    case 'request_refund':
      return notifyOrganizer({
        type: 'refund.requested',
        ...ctx,
        payload: {
          eventId,
          eventTitle: eventTitle || payload.eventTitle,
          amount: payload.amount,
          guestName: payload.guestName || payload.name,
        },
        entityId: payload.saleId || payload.ticketId || payload.requestId,
      });
    case 'cancel_hold':
      return notifyOrganizer({
        type: 'hold.cancelled',
        ...ctx,
        payload: {
          eventId,
          eventTitle: eventTitle || payload.eventTitle,
          amount: payload.amount,
          guestName: payload.guestName,
        },
        entityId: payload.holdId || payload.txId,
      });
    case 'mark_sold_out':
      return notifyOrganizer({
        type: 'sale.sold_out',
        ...ctx,
        payload: {
          eventId,
          eventTitle,
          ticketName: payload.ticketName,
        },
        entityId: payload.ticketId || eventId,
      });
    case 'record_sale': {
      if (telegramId) {
        recordSaleForDigest(telegramId, {
          tickets: payload.tickets || 1,
          amount: payload.amount || 0,
        });
      } else {
        for (const id of await listOrganizerTelegramIds()) {
          recordSaleForDigest(id, {
            tickets: payload.tickets || 1,
            amount: payload.amount || 0,
          });
        }
      }
      if (payload.soldOut) {
        return notifyOrganizer({
          type: 'sale.sold_out',
          ...ctx,
          payload: { eventId, eventTitle, ticketName: payload.ticketName },
          entityId: payload.ticketId || eventId,
        });
      }
      return { skipped: true, digest: true };
    }
    case 'payout_sent':
      return notifyOrganizer({
        type: 'payout.sent',
        ...ctx,
        payload: {
          amount: payload.amount,
          period: payload.period || payload.eventTitle,
          eta: payload.eta,
          eventTitle: payload.eventTitle,
        },
        entityId: payload.payoutId || payload.id,
      });
    case 'payout_failed':
      return notifyOrganizer({
        type: 'payout.failed',
        ...ctx,
        payload: {
          amount: payload.amount,
          error: payload.error,
        },
        entityId: payload.payoutId || payload.id,
      });
    case 'billing_invoice':
      return notifyOrganizer({
        type: 'billing.invoice',
        ...ctx,
        payload: {
          invoiceNumber: payload.number || payload.invoiceNumber,
          amount: payload.amount,
          due: payload.due,
        },
        entityId: payload.number || payload.invoiceNumber,
      });
    case 'plan_limit':
      return notifyOrganizer({
        type: 'plan.limit',
        ...ctx,
        payload: { blocked: payload.blocked },
        entityId: payload.key || 'plan-limit',
      });
    case 'broadcast_maintenance':
      return notifyOrganizer({
        type: 'maintenance',
        payload: { window: payload.window || payload.text },
        entityId: payload.id || payload.window || 'maintenance',
      });
    case 'broadcast_legal':
      return notifyOrganizer({
        type: 'legal.updated',
        payload: { text: payload.text },
        entityId: payload.version || 'legal',
      });
    default:
      return { skipped: true };
  }
}
