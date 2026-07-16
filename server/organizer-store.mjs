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
    // Dynamic import path kept sync-friendly via global set in handler
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

function defaultStore() {
  const now = Date.now();
  const startsAt = new Date(now + 86_400_000).toISOString();
  const endsAt = new Date(now + 86_400_000 + 3 * 3600_000).toISOString();
  const events = [
    {
      id: 'evt-demo-1',
      name: 'Demo Event',
      ticketsLeft: 40,
      ticketsTotal: 100,
      startsAt,
      endsAt,
      paused: false,
      phase: 'upcoming',
      visible: true,
    },
  ];
  return {
    profile: {
      displayName: 'Taneesh Organizer',
      bio: '',
      avatarUrl: '',
      logoEmoji: '🎟️',
      /** idle | pending | approved | rejected */
      kycStatus: 'idle',
      verified: false,
    },
    events,
    orders: [],
    audience: [],
    controllers: [],
    finance: { hold: 0, totalPaid: 0, history: [] },
    socialLinks: [],
    meta: {
      eventsCount: events.length,
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

export async function runAction(adminAction, payload = {}) {
  if (adminAction === 'create_event') {
    const startsAt = payload.startsAt || new Date().toISOString();
    const endsAt =
      payload.endsAt ||
      new Date(new Date(startsAt).getTime() + 3 * 3600_000).toISOString();
    const isFree = payload.isFree !== false;
    const status = payload.status === 'draft' ? 'draft' : 'published';
    const tickets = Array.isArray(payload.tickets) ? payload.tickets : [];
    let ticketsLeft = null;
    let ticketsTotal = null;
    if (!isFree && tickets.length) {
      ticketsTotal = tickets.reduce((sum, t) => sum + Math.max(0, Number(t.capacity) || 0), 0);
      ticketsLeft = ticketsTotal;
    } else if (payload.capacity != null) {
      ticketsTotal = Math.max(1, Number(payload.capacity) || 100);
      ticketsLeft = ticketsTotal;
    }

    const i18n = payload.i18n || {};
    const titleRu =
      String(payload.name || i18n.title?.ru || 'Мероприятие').trim() || 'Мероприятие';

    store.events.push({
      id: `evt-${Date.now()}`,
      name: titleRu,
      i18n: {
        title: {
          ru: titleRu,
          uz: String(i18n.title?.uz || '').trim(),
          en: String(i18n.title?.en || '').trim(),
        },
        description: {
          ru: String(i18n.description?.ru || '').trim(),
          uz: String(i18n.description?.uz || '').trim(),
          en: String(i18n.description?.en || '').trim(),
        },
      },
      photos: Array.isArray(payload.photos) ? payload.photos.slice(0, 6) : [],
      startsAt,
      endsAt,
      location: {
        name: String(payload.location?.name || '').trim(),
        address: String(payload.location?.address || '').trim(),
      },
      interests: Array.isArray(payload.interests) ? payload.interests : [],
      isFree,
      freeEntryMode: isFree ? (payload.freeEntryMode === 'open' ? 'open' : 'approval') : undefined,
      tickets: isFree
        ? []
        : tickets.map((t) => ({
            id: String(t.id || `t-${Date.now()}`),
            name: String(t.name || '').trim(),
            price: Math.max(0, Number(t.price) || 0),
            capacity: Math.max(0, Number(t.capacity) || 0),
          })),
      ticketsLeft,
      ticketsTotal,
      status,
      paused: false,
      phase: status === 'draft' ? 'draft' : 'upcoming',
      visible: status !== 'draft',
    });
    refreshMeta();
    return getSnapshot();
  }

  if (
    adminAction === 'set_starts_at' ||
    adminAction === 'set_ends_at' ||
    adminAction === 'set_tickets_left' ||
    adminAction === 'set_paused' ||
    adminAction === 'set_event_visible'
  ) {
    const event = store.events.find((e) => e.id === payload.eventId);
    if (event) {
      if (payload.startsAt != null) event.startsAt = payload.startsAt;
      if (payload.endsAt != null) event.endsAt = payload.endsAt;
      if (payload.ticketsLeft != null) event.ticketsLeft = payload.ticketsLeft;
      if (payload.paused != null) event.paused = payload.paused;
      if (payload.visible != null) event.visible = payload.visible;
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
