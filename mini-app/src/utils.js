export const PLATFORM_LABELS = {
  instagram: 'Instagram',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X / Twitter',
  website: 'Сайт',
};

export const FIXED_SOCIAL_PLATFORMS = [
  'instagram',
  'telegram',
  'tiktok',
  'youtube',
  'twitter',
  'website',
];

export function normalizeSocialLinks(links = []) {
  const byPlatform = new Map();
  for (const link of links || []) {
    if (link?.platform && !byPlatform.has(link.platform)) {
      byPlatform.set(link.platform, link);
    }
  }
  return FIXED_SOCIAL_PLATFORMS.map((platform, index) => {
    const existing = byPlatform.get(platform);
    return {
      id: existing?.id || `social_${platform}`,
      platform,
      url: existing?.url || '',
      visible: existing?.visible !== false,
      clicks: Number(existing?.clicks) || 0,
      sort_order: index,
      title: existing?.title || '',
    };
  });
}

export function formatLinkClicks(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(v);
}

export function formatPrice(n, currency = 'UZS') {
  return `${Number(n).toLocaleString('ru-RU')} ${currency}`;
}

const STATUS_LABELS = {
  paid: 'Оплачен',
  pending: 'Ожидает',
  shipped: 'Отправлен',
  failed: 'Ошибка',
  refunded: 'Возврат',
};

export function orderStatusLabel(status) {
  return STATUS_LABELS[status] || status || '—';
}

export function deliveryTypeLabel(type) {
  if (type === 'pickup') return 'Самовывоз';
  if (type === 'delivery') return 'Курьер';
  return type || '—';
}

/** Статусы мероприятий (под капотом те же phase-ключи, что у дропов). */
export function phaseLabel(phase, paused) {
  if (paused) return 'Пауза';
  const map = {
    active: 'Идёт',
    pre_drop: 'Скоро',
    sold_out: 'Распродано',
  };
  return map[phase] || 'Скоро';
}

export function resolveDropState(snapshot = {}) {
  const drops = snapshot.drops || [];
  const active = drops.find((d) => d.id === snapshot.activeDropId) || drops[0];
  return {
    phase: active?.phase ?? snapshot.phase,
    paused: Boolean(active?.paused ?? snapshot.paused),
  };
}

export function dropStatusTone(phase, paused) {
  if (paused) return 'paused';
  if (phase === 'active') return 'active';
  if (phase === 'sold_out') return 'sold-out';
  return 'pre-drop';
}

function countEventsByStatus(events = []) {
  const counts = { active: 0, pre_drop: 0, sold_out: 0, paused: 0 };
  for (const event of events) {
    if (event.paused) {
      counts.paused += 1;
    } else if (event.phase === 'active') {
      counts.active += 1;
    } else if (event.phase === 'sold_out') {
      counts.sold_out += 1;
    } else {
      counts.pre_drop += 1;
    }
  }
  return counts;
}

function buildEventStatusPills(events = []) {
  if (!events.length) {
    return [{ id: 'empty', label: 'Нет мероприятий', tone: 'pre-drop' }];
  }

  const counts = countEventsByStatus(events);
  return [
    counts.active > 0 ? { id: 'active', label: `${counts.active} идёт`, tone: 'active' } : null,
    counts.pre_drop > 0 ? { id: 'pre_drop', label: `${counts.pre_drop} скоро`, tone: 'pre-drop' } : null,
    counts.sold_out > 0 ? { id: 'sold_out', label: `${counts.sold_out} распродано`, tone: 'sold-out' } : null,
    counts.paused > 0 ? { id: 'paused', label: `${counts.paused} пауза`, tone: 'paused' } : null,
  ].filter(Boolean);
}

/** Hub hero: pill-теги по статусам мероприятий */
export function buildHubHeroCombos(snapshot = {}) {
  const events = snapshot.drops || snapshot.events || [];
  return { pills: buildEventStatusPills(events) };
}

export function formatDropDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDropDateOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

export function formatDropTimeOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function vitrinaUrl() {
  // Phase 1 placeholder — later: public organizer page URL from snapshot
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://taneesh.org';
}

export function vitrinaHost() {
  try {
    return new URL(vitrinaUrl()).host;
  } catch {
    return 'taneesh.org';
  }
}

export function vitrinaShortUrl() {
  try {
    return new URL(vitrinaUrl()).host;
  } catch {
    return 'taneesh.org';
  }
}

export function pendingOrders(orders = []) {
  return orders.filter(o => o.status === 'pending');
}

export function paidRevenue(orders = []) {
  return (orders || [])
    .filter((o) => o.status === 'paid' || o.status === 'shipped')
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
}

export function productThumb(product = {}) {
  if (product.mediaType === 'images' && product.images?.[0]) return product.images[0];
  return '';
}

export function productAcronym(product = {}) {
  return String(product.name || '?').trim().charAt(0).toUpperCase() || '?';
}
