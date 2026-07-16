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
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

const SALE_STATUS = {
  paid: 'Оплачен',
  pending: 'Ожидает',
  shipped: 'Выдан',
  failed: 'Ошибка',
  refunded: 'Возврат',
};

export function orderStatusLabel(status) {
  return SALE_STATUS[status] || status || '—';
}

export function deliveryTypeLabel(type) {
  if (type === 'pickup') return 'На месте';
  if (type === 'delivery') return 'Доставка';
  return type || '—';
}

/** upcoming | live | sold_out | paused */
export function phaseLabel(phase, paused) {
  if (paused || phase === 'paused') return 'Пауза';
  const map = {
    live: 'Идёт',
    active: 'Идёт',
    upcoming: 'Скоро',
    sold_out: 'Распродано',
  };
  return map[phase] || 'Скоро';
}

export function eventStatusTone(phase, paused) {
  if (paused || phase === 'paused') return 'paused';
  if (phase === 'live' || phase === 'active') return 'active';
  if (phase === 'sold_out') return 'sold-out';
  return 'upcoming';
}

function countEventsByStatus(events = []) {
  const counts = { live: 0, upcoming: 0, sold_out: 0, paused: 0 };
  for (const event of events) {
    if (event.paused || event.phase === 'paused') counts.paused += 1;
    else if (event.phase === 'live' || event.phase === 'active') counts.live += 1;
    else if (event.phase === 'sold_out') counts.sold_out += 1;
    else counts.upcoming += 1;
  }
  return counts;
}

export function buildHubHeroCombos(snapshot = {}) {
  const events = snapshot.events || [];
  if (!events.length) {
    return { pills: [{ id: 'empty', label: 'Нет мероприятий', tone: 'pre-drop' }] };
  }
  const counts = countEventsByStatus(events);
  return {
    pills: [
      counts.live > 0 ? { id: 'live', label: `${counts.live} идёт`, tone: 'active' } : null,
      counts.upcoming > 0 ? { id: 'upcoming', label: `${counts.upcoming} скоро`, tone: 'pre-drop' } : null,
      counts.sold_out > 0 ? { id: 'sold_out', label: `${counts.sold_out} распродано`, tone: 'sold-out' } : null,
      counts.paused > 0 ? { id: 'paused', label: `${counts.paused} пауза`, tone: 'paused' } : null,
    ].filter(Boolean),
  };
}

export function formatEventDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatEventDateOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatEventTimeOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function publicPageUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://taneesh.org';
}

export function publicPageHost() {
  try {
    return new URL(publicPageUrl()).host;
  } catch {
    return 'taneesh.org';
  }
}

export function pendingOrders(orders = []) {
  return orders.filter((o) => o.status === 'pending');
}

export function formatPrice(amount) {
  const n = Number(amount) || 0;
  return `${n.toLocaleString('ru-RU')} сум`;
}

export function profileOf(snapshot = {}) {
  return snapshot.profile || snapshot.brand || {};
}
