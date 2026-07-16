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
  const events = [
    {
      id: 'evt-demo-1',
      name: 'Demo Event',
      stock: 40,
      totalStock: 100,
      startsAt: new Date(now + 86_400_000).toISOString(),
      paused: false,
      phase: 'pre_drop',
      visible: true,
    },
  ];
  return {
    storefront: {
      displayName: 'Taneesh Organizer',
      bio: '',
      avatarUrl: '',
      logoEmoji: '🎟️',
      socials: {},
    },
    brand: { name: 'Taneesh Organizer', logoEmoji: '🎟️' },
    // events — канон; drops — alias для старых экранов
    events,
    drops: events,
    products: [],
    orders: [],
    audience: [],
    waitlist: [],
    controllers: [],
    meta: {
      eventsCount: events.length,
      audienceCount: 0,
      controllersCount: 0,
      pendingApplications: 0,
    },
  };
}

let store = defaultStore();

function syncAliases() {
  store.drops = store.events;
  store.waitlist = store.audience;
  store.meta = {
    ...store.meta,
    eventsCount: store.events.length,
    audienceCount: store.audience.length,
    controllersCount: (store.controllers || []).length,
  };
}

export async function runAction(adminAction, payload = {}) {
  if (adminAction === 'create_event') {
    const id = `evt-${Date.now()}`;
    const capacity = Math.max(1, Number(payload.capacity) || 100);
    store.events.push({
      id,
      name: String(payload.name || 'Мероприятие').trim(),
      stock: capacity,
      totalStock: capacity,
      startsAt: payload.startsAt || new Date().toISOString(),
      paused: false,
      phase: 'pre_drop',
      visible: true,
    });
    syncAliases();
    return getSnapshot();
  }

  if (adminAction === 'set_starts_at' || adminAction === 'set_stock' || adminAction === 'set_paused' || adminAction === 'set_event_visible' || adminAction === 'set_drop_visible') {
    const id = payload.eventId || payload.dropId;
    const event = store.events.find((e) => e.id === id);
    if (event) {
      if (payload.startsAt != null) event.startsAt = payload.startsAt;
      if (payload.stock != null) event.stock = payload.stock;
      if (payload.paused != null) event.paused = payload.paused;
      if (payload.visible != null) event.visible = payload.visible;
    }
    syncAliases();
    return getSnapshot();
  }

  if (adminAction === 'update_storefront') {
    store.storefront = { ...store.storefront, ...(payload.storefront || {}) };
    return getSnapshot();
  }

  return getSnapshot();
}
