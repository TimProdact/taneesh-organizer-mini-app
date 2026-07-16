export const EVENT_INTERESTS = [
  'Tech',
  'Design',
  'Business',
  'Music',
  'Art',
  'Sports',
  'Wellness',
  'Food',
];

export const emptyI18n = () => ({ ru: '', uz: '', en: '' });

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
