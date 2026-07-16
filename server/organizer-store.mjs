/**
 * Organizer access + demo snapshot.
 * On Netlify: granted Telegram IDs live in Blobs (persist across deploys).
 * Locally: data/organizer-telegram-ids.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const IDS_FILE = join(DATA_DIR, 'organizer-telegram-ids.json');
const BLOB_STORE = 'taneesh-organizer';
const BLOB_ADMINS = 'organizer-telegram-ids';

/** Survives for the life of the Node process (Render free has no persistent disk). */
const memoryGranted = new Set();

let blobsReady = false;

export function initBlobs(event) {
  try {
    if (event) {
      globalThis.__organizer_netlify_event = event;
      blobsReady = true;
    }
  } catch {
    blobsReady = false;
  }
}

function envIds() {
  return String(process.env.TELEGRAM_ORGANIZER_IDS || process.env.TELEGRAM_ADMIN_IDS || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

function loadLocalIds() {
  try {
    if (!existsSync(IDS_FILE)) return [];
    const raw = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
    return Array.isArray(raw) ? raw.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveLocalIds(ids) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(IDS_FILE, JSON.stringify([...new Set(ids.map(Number))], null, 2));
}

async function getBlobStore() {
  try {
    const { getStore, connectLambda } = await import('@netlify/blobs');
    const event = globalThis.__organizer_netlify_event;
    if (event) connectLambda(event);
    return getStore(BLOB_STORE);
  } catch {
    return null;
  }
}

async function loadBlobIds() {
  const store = await getBlobStore();
  if (!store) return null;
  try {
    const raw = await store.get(BLOB_ADMINS, { type: 'json' });
    if (Array.isArray(raw)) return raw.map(Number).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

async function saveBlobIds(ids) {
  const store = await getBlobStore();
  if (!store) return false;
  await store.setJSON(BLOB_ADMINS, [...new Set(ids.map(Number))]);
  return true;
}

export async function isOrganizer(telegramId) {
  const id = Number(telegramId);
  if (envIds().includes(id)) return true;
  if (memoryGranted.has(id)) return true;
  const blobIds = await loadBlobIds();
  if (blobIds && blobIds.includes(id)) return true;
  return loadLocalIds().includes(id);
}

export async function grantOrganizer(telegramId) {
  const id = Number(telegramId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Bad telegram id');

  memoryGranted.add(id);

  const blobIds = (await loadBlobIds()) || [];
  if (!blobIds.includes(id)) {
    blobIds.push(id);
    const ok = await saveBlobIds(blobIds);
    if (!ok) {
      const local = loadLocalIds();
      if (!local.includes(id)) {
        local.push(id);
        saveLocalIds(local);
      }
    }
  } else {
    await saveBlobIds(blobIds);
  }
  console.log('[grantOrganizer]', id);
  return true;
}

export function getSnapshot() {
  return structuredClone(store);
}

function emptyMetrics(isFree, freeEntryMode) {
  if (!isFree) {
    return {
      revenue: 38_500_000,
      ticketsSold: 450,
      refunds: 3_975_000,
      views: 15_840,
      checkouts: 3_420,
      conversion: 21.6,
    };
  }
  if (freeEntryMode === 'approval') {
    return {
      approved: 12,
      pending: 5,
      declined: 2,
      views: 2_140,
      checkouts: 19,
      conversion: 0.9,
    };
  }
  return {
    registered: 48,
    views: 1_200,
    conversion: 4.0,
  };
}

function normalizeTickets(tickets, isFree) {
  if (isFree) return [];
  return (Array.isArray(tickets) ? tickets : []).map((t) => ({
    id: String(t.id || `t-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`),
    name: String(t.name || '').trim(),
    price: Math.max(0, Number(t.price) || 0),
    capacity: Math.max(0, Number(t.capacity) || 0),
    sold: Math.max(0, Number(t.sold) || 0),
    originalPrice:
      t.originalPrice != null && Number(t.originalPrice) > Number(t.price)
        ? Number(t.originalPrice)
        : undefined,
    discountLabel: t.discountLabel ? String(t.discountLabel) : undefined,
  }));
}

function buildEventRecord(payload, existing = null) {
  const startsAt = payload.startsAt || existing?.startsAt || new Date().toISOString();
  const endsAt =
    payload.endsAt ||
    existing?.endsAt ||
    new Date(new Date(startsAt).getTime() + 3 * 3600_000).toISOString();
  const isFree = payload.isFree != null ? payload.isFree !== false : existing?.isFree !== false;
  const status =
    payload.status != null
      ? payload.status === 'draft'
        ? 'draft'
        : 'published'
      : existing?.status || 'published';
  const tickets = normalizeTickets(
    payload.tickets != null ? payload.tickets : existing?.tickets,
    isFree,
  );
  let ticketsLeft = existing?.ticketsLeft ?? null;
  let ticketsTotal = existing?.ticketsTotal ?? null;
  if (!isFree && tickets.length) {
    ticketsTotal = tickets.reduce((sum, t) => sum + t.capacity, 0);
    const sold = tickets.reduce((sum, t) => sum + (t.sold || 0), 0);
    ticketsLeft = Math.max(0, ticketsTotal - sold);
  } else if (isFree) {
    ticketsLeft = null;
    ticketsTotal = null;
  }

  const i18n = payload.i18n || existing?.i18n || {};
  const titleRu =
    String(payload.name || i18n.title?.ru || existing?.name || 'Мероприятие').trim() ||
    'Мероприятие';
  const freeEntryMode = isFree
    ? payload.freeEntryMode === 'open' || existing?.freeEntryMode === 'open'
      ? 'open'
      : 'approval'
    : undefined;

  return {
    id: existing?.id || `evt-${Date.now()}`,
    name: titleRu,
    i18n: {
      title: {
        ru: titleRu,
        uz: String(i18n.title?.uz ?? existing?.i18n?.title?.uz ?? '').trim(),
        en: String(i18n.title?.en ?? existing?.i18n?.title?.en ?? '').trim(),
      },
      description: {
        ru: String(i18n.description?.ru ?? existing?.i18n?.description?.ru ?? '').trim(),
        uz: String(i18n.description?.uz ?? existing?.i18n?.description?.uz ?? '').trim(),
        en: String(i18n.description?.en ?? existing?.i18n?.description?.en ?? '').trim(),
      },
    },
    photos:
      payload.photos != null
        ? (Array.isArray(payload.photos) ? payload.photos : []).slice(0, 6)
        : existing?.photos || [],
    startsAt,
    endsAt,
    location: {
      name: String(payload.location?.name ?? existing?.location?.name ?? '').trim(),
      address: String(payload.location?.address ?? existing?.location?.address ?? '').trim(),
    },
    interests:
      payload.interests != null
        ? Array.isArray(payload.interests)
          ? payload.interests
          : []
        : existing?.interests || [],
    isFree,
    freeEntryMode,
    tickets,
    ticketsLeft,
    ticketsTotal,
    status,
    paused: existing?.paused ?? false,
    phase:
      status === 'draft'
        ? 'draft'
        : existing?.phase && existing.phase !== 'draft'
          ? existing.phase
          : 'upcoming',
    visible: payload.visible != null ? payload.visible : status !== 'draft',
    metrics: existing?.metrics || emptyMetrics(isFree, freeEntryMode),
    attendees: existing?.attendees || [],
    sales: existing?.sales || [],
  };
}

function defaultStore() {
  const now = Date.now();
  const startsAt = new Date(now + 86_400_000).toISOString();
  const endsAt = new Date(now + 86_400_000 + 3 * 3600_000).toISOString();
  const freeEvent = buildEventRecord({
    name: 'Demo Event',
    startsAt,
    endsAt,
    isFree: true,
    freeEntryMode: 'approval',
    status: 'published',
    location: { name: 'Magic City', address: 'Ташкент, ул. Бабура 6' },
    interests: ['Business', 'Нетворкинг'],
    i18n: {
      title: { ru: 'Demo Event', uz: '', en: '' },
      description: {
        ru: 'Демо-мероприятие для проверки карточки организатора в Mini App.',
        uz: '',
        en: '',
      },
    },
    photos: [
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop',
    ],
  });
  freeEvent.attendees = [
    {
      id: 'a1',
      name: 'Алишер Каримов',
      contact: '+998 90 123 45 67',
      channel: 'phone',
      type: 'pending',
      checkIn: 'waiting',
    },
    {
      id: 'a2',
      name: 'Малика Саидова',
      contact: 'malika@example.com',
      channel: 'email',
      type: 'approved',
      checkIn: 'waiting',
    },
    {
      id: 'a3',
      name: 'Тимур Юнусов',
      contact: '+998 91 777 88 99',
      channel: 'phone',
      type: 'invited',
      checkIn: 'waiting',
    },
  ];
  freeEvent.metrics = emptyMetrics(true, 'approval');

  const paidStarts = new Date(now + 3 * 86_400_000).toISOString();
  const paidEnds = new Date(now + 3 * 86_400_000 + 4 * 3600_000).toISOString();
  const paidEvent = buildEventRecord({
    name: 'Tashkent Tech Night',
    startsAt: paidStarts,
    endsAt: paidEnds,
    isFree: false,
    status: 'published',
    location: { name: 'IT Park', address: 'Ташкент' },
    interests: ['Tech', 'Программирование'],
    tickets: [
      { id: 't1', name: 'Standard', price: 150000, originalPrice: 200000, capacity: 200, sold: 80, discountLabel: '-25%' },
      { id: 't2', name: 'VIP', price: 450000, capacity: 50, sold: 12 },
    ],
    i18n: {
      title: { ru: 'Tashkent Tech Night', uz: '', en: '' },
      description: { ru: 'Платное демо-событие с продажами.', uz: '', en: '' },
    },
    photos: [
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&auto=format&fit=crop',
    ],
  });
  paidEvent.attendees = [
    {
      id: 'p1',
      name: 'Дилноза Рахимова',
      contact: 'dilnoza@mail.uz',
      channel: 'email',
      type: 'Standard',
      orderId: 'ORD-1001',
      checkIn: 'entered',
    },
    {
      id: 'p2',
      name: 'Жасур Алиев',
      contact: '+998 93 111 22 33',
      channel: 'phone',
      type: 'VIP',
      orderId: 'ORD-1002',
      checkIn: 'waiting',
    },
  ];
  paidEvent.sales = [
    {
      id: 's1',
      date: new Date(now - 3600_000).toISOString(),
      buyer: 'dilnoza@mail.uz',
      amount: 150000,
      status: 'paid',
      paylovId: 'PAY-2847193',
    },
    {
      id: 's2',
      date: new Date(now - 7200_000).toISOString(),
      buyer: '+998931112233',
      amount: 450000,
      status: 'paid',
      paylovId: 'PAY-2847201',
    },
    {
      id: 's3',
      date: new Date(now - 86400_000).toISOString(),
      buyer: 'refund@mail.uz',
      amount: 150000,
      status: 'refunded',
      paylovId: 'PAY-2847000',
    },
  ];
  paidEvent.metrics = emptyMetrics(false);

  return {
    profile: {
      displayName: 'Taneesh Organizer',
      bio: '',
      avatarUrl: '',
      logoEmoji: '🎟️',
      kycStatus: 'idle',
      verified: false,
    },
    events: [freeEvent, paidEvent],
    orders: [],
    audience: [],
    controllers: [],
    finance: { hold: 0, totalPaid: 0, history: [] },
    socialLinks: [],
    meta: {
      eventsCount: 2,
      audienceCount: 0,
      controllersCount: 0,
      pendingApplications: 0,
      verified: false,
    },
  };
}

let store = defaultStore();

function refreshMeta() {
  const verified = store.profile?.kycStatus === 'approved' || store.profile?.verified === true;
  store.profile = {
    ...store.profile,
    verified,
  };
  store.meta = {
    ...store.meta,
    eventsCount: store.events.length,
    audienceCount: store.audience.length,
    controllersCount: store.controllers.length,
    verified,
  };
}

function findEvent(eventId) {
  return store.events.find((e) => String(e.id) === String(eventId));
}

function soldOrAttended(event) {
  const sold = (event.tickets || []).reduce((s, t) => s + (t.sold || 0), 0);
  const attendees = (event.attendees || []).length;
  const sales = (event.sales || []).filter((s) => s.status === 'paid').length;
  return sold > 0 || attendees > 0 || sales > 0;
}

export async function runAction(adminAction, payload = {}) {
  if (adminAction === 'create_event') {
    store.events.push(buildEventRecord(payload));
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'update_event') {
    const idx = store.events.findIndex((e) => String(e.id) === String(payload.eventId));
    if (idx < 0) throw new Error('Событие не найдено');
    const existing = store.events[idx];
    if (!existing.isFree && soldOrAttended(existing) && payload.force !== true) {
      // allow update of content, but keep attendees/sales/metrics
    }
    store.events[idx] = buildEventRecord(payload, existing);
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'delete_event') {
    const event = findEvent(payload.eventId);
    if (!event) throw new Error('Событие не найдено');
    if (soldOrAttended(event)) {
      throw new Error('Нельзя удалить мероприятие, на которое уже есть участники');
    }
    store.events = store.events.filter((e) => String(e.id) !== String(payload.eventId));
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'publish_event') {
    const event = findEvent(payload.eventId);
    if (!event) throw new Error('Событие не найдено');
    event.status = 'published';
    event.phase = event.phase === 'draft' ? 'upcoming' : event.phase;
    event.visible = true;
    refreshMeta();
    return getSnapshot();
  }

  if (
    adminAction === 'set_starts_at' ||
    adminAction === 'set_ends_at' ||
    adminAction === 'set_tickets_left' ||
    adminAction === 'set_paused' ||
    adminAction === 'set_event_visible' ||
    adminAction === 'set_event_name' ||
    adminAction === 'set_event_description' ||
    adminAction === 'set_event_location' ||
    adminAction === 'set_event_interests'
  ) {
    const event = findEvent(payload.eventId);
    if (event) {
      if (payload.startsAt != null) event.startsAt = payload.startsAt;
      if (payload.endsAt != null) event.endsAt = payload.endsAt;
      if (payload.ticketsLeft != null) event.ticketsLeft = payload.ticketsLeft;
      if (payload.paused != null) event.paused = payload.paused;
      if (payload.visible != null) event.visible = payload.visible;
      if (payload.name != null) {
        event.name = String(payload.name).trim() || event.name;
        event.i18n = event.i18n || { title: {}, description: {} };
        event.i18n.title = { ...(event.i18n.title || {}), ru: event.name };
      }
      if (payload.description != null) {
        event.i18n = event.i18n || { title: {}, description: {} };
        event.i18n.description = {
          ...(event.i18n.description || {}),
          ru: String(payload.description).trim(),
        };
      }
      if (payload.location != null) {
        event.location = {
          name: String(payload.location.name || '').trim(),
          address: String(payload.location.address || '').trim(),
        };
      }
      if (payload.interests != null) {
        event.interests = Array.isArray(payload.interests) ? payload.interests : [];
      }
    }
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'invite_attendee') {
    const event = findEvent(payload.eventId);
    if (!event) throw new Error('Событие не найдено');
    const name = String(payload.name || '').trim();
    const contact = String(payload.contact || '').trim();
    const channel = payload.channel === 'email' ? 'email' : 'phone';
    if (!name) throw new Error('Укажите имя');
    if (!contact) throw new Error('Укажите контакт');
    event.attendees = event.attendees || [];
    event.attendees.unshift({
      id: `inv-${Date.now()}`,
      name,
      contact,
      channel,
      type: event.isFree ? 'invited' : 'Invited',
      checkIn: 'waiting',
      orderId: event.isFree ? undefined : `ORD-${Math.floor(Math.random() * 9000 + 1000)}`,
    });
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'attendee_action') {
    const event = findEvent(payload.eventId);
    if (!event) throw new Error('Событие не найдено');
    const att = (event.attendees || []).find((a) => String(a.id) === String(payload.attendeeId));
    if (!att) throw new Error('Участник не найден');
    const action = payload.action;
    if (action === 'approve') att.type = 'approved';
    else if (action === 'decline') {
      event.attendees = event.attendees.filter((a) => a.id !== att.id);
    } else if (action === 'check_in') att.checkIn = 'entered';
    else if (action === 'cancel_invite' || action === 'cancel_approval') {
      event.attendees = event.attendees.filter((a) => a.id !== att.id);
    }
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'update_profile') {
    store.profile = { ...store.profile, ...(payload.profile || {}) };
    return getSnapshot();
  }

  if (adminAction === 'update_social_links') {
    store.socialLinks = payload.socialLinks || [];
    return getSnapshot();
  }

  if (adminAction === 'submit_kyc') {
    store.profile = {
      ...store.profile,
      kycStatus: 'pending',
      verified: false,
    };
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'set_kyc_status') {
    const status = payload.status;
    if (['idle', 'pending', 'approved', 'rejected'].includes(status)) {
      store.profile = {
        ...store.profile,
        kycStatus: status,
        verified: status === 'approved',
      };
      refreshMeta();
    }
    return getSnapshot();
  }

  if (adminAction === 'add_controller') {
    if (store.controllers.length >= 5) {
      throw new Error('Максимальное количество контролеров: 5');
    }
    const name = String(payload.name || '').trim();
    const phoneNational = String(payload.phoneNational || '')
      .replace(/\D/g, '')
      .replace(/^998/, '')
      .slice(0, 9);
    if (!name) throw new Error('Укажите имя и фамилию');
    if (phoneNational.length !== 9) throw new Error('Укажите номер телефона (+998)');
    const dup = store.controllers.some((c) => c.phoneNational === phoneNational);
    if (dup) throw new Error('Контролер с таким номером уже есть');
    store.controllers.push({
      id: `ctl-${Date.now()}`,
      name,
      phoneNational,
      phone: payload.phone || `+998${phoneNational}`,
      scanCount: 0,
      addedAt: new Date().toISOString(),
      lastLoginAt: null,
    });
    refreshMeta();
    return getSnapshot();
  }

  if (adminAction === 'remove_controller') {
    const id = payload.controllerId;
    store.controllers = store.controllers.filter((c) => String(c.id) !== String(id));
    refreshMeta();
    return getSnapshot();
  }

  return getSnapshot();
}
