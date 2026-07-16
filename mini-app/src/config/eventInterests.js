/**
 * Interests for organizer events.
 * Source: landing catalog (`landingData.INTERESTS`) + create-modal tags.
 */
export const EVENT_INTERESTS = [
  { id: 'videogames', emoji: '🎮', label: 'Видеоигры' },
  { id: 'psychology', emoji: '💚', label: 'Психология' },
  { id: 'drawing', emoji: '🎨', label: 'Рисование' },
  { id: 'travel', emoji: '🌍', label: 'Путешествия' },
  { id: 'programming', emoji: '💻', label: 'Программирование' },
  { id: 'music', emoji: '🎵', label: 'Музыка' },
  { id: 'photo', emoji: '📸', label: 'Фотография' },
  { id: 'sport', emoji: '🏃', label: 'Спорт' },
  { id: 'wine', emoji: '🍷', label: 'Вино' },
  { id: 'cinema', emoji: '🎬', label: 'Кино' },
  { id: 'books', emoji: '📚', label: 'Книги' },
  { id: 'yoga', emoji: '🧘', label: 'Йога' },
  { id: 'cooking', emoji: '🍳', label: 'Кулинария' },
  { id: 'karaoke', emoji: '🎤', label: 'Караоке' },
  { id: 'animals', emoji: '🐕', label: 'Животные' },
  { id: 'aviation', emoji: '✈️', label: 'Авиация' },
  { id: 'theatre', emoji: '🎭', label: 'Театр' },
  { id: 'trekking', emoji: '🏔️', label: 'Треккинг' },
  { id: 'dance', emoji: '💃', label: 'Танцы' },
  { id: 'boardgames', emoji: '🎲', label: 'Настолки' },
  { id: 'tech', emoji: '⚙️', label: 'Tech' },
  { id: 'design', emoji: '✏️', label: 'Design' },
  { id: 'business', emoji: '💼', label: 'Business' },
  { id: 'art', emoji: '🖼️', label: 'Art' },
  { id: 'sports-en', emoji: '🏅', label: 'Sports' },
  { id: 'wellness', emoji: '🌿', label: 'Wellness' },
  { id: 'food', emoji: '🍜', label: 'Food' },
  { id: 'networking', emoji: '🤝', label: 'Нетворкинг' },
  { id: 'standup', emoji: '🎙️', label: 'Стендап' },
  { id: 'techno', emoji: '🔊', label: 'Техно' },
];

export const emptyI18n = () => ({ ru: '', uz: '', en: '' });

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ticketDiscountLabel(price, originalPrice) {
  const p = Number(price) || 0;
  const o = Number(originalPrice) || 0;
  if (!o || o <= p) return '';
  const pct = Math.round((1 - p / o) * 100);
  return pct > 0 ? `-${pct}%` : '';
}
