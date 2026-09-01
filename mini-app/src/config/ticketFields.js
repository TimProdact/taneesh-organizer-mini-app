import { uid, ticketDiscountLabel } from './eventInterests.js';

export const GENDER_OPTIONS = [
  { id: 'any', label: 'Любой' },
  { id: 'female', label: 'Ж' },
  { id: 'male', label: 'М' },
];

export const AGE_OPTIONS = [
  { id: '', label: 'Любой' },
  { id: '0', label: '0+' },
  { id: '18', label: '18+' },
  { id: '21', label: '21+' },
];

export function genderLabel(id) {
  return GENDER_OPTIONS.find((g) => g.id === id)?.label || 'Любой';
}

export function ageLabel(minAge) {
  if (minAge == null || minAge === '') return 'Любой';
  const n = Number(minAge);
  if (!Number.isFinite(n) || n <= 0) return n === 0 ? '0+' : 'Любой';
  return `${n}+`;
}

export function paymentModeLabel(mode) {
  return mode === 'at_door' ? 'На входе' : 'Онлайн';
}

export function ticketModeOf(event) {
  if (event?.ticketMode === 'free' || event?.ticketMode === 'paid' || event?.ticketMode === 'at_door') {
    return event.ticketMode;
  }
  if (event?.isFree === false) {
    const tickets = event.tickets || [];
    if (tickets.length && tickets.every((t) => t.paymentMode === 'at_door')) return 'at_door';
    return 'paid';
  }
  return 'free';
}

export function blankTicket(ticketMode = 'paid') {
  return {
    id: uid('t'),
    name: '',
    price: '',
    originalPrice: '',
    capacity: '',
    seatsPerTicket: 1,
    description: '',
    paymentMode: ticketMode === 'at_door' ? 'at_door' : 'online',
    audienceGender: 'any',
    minAge: '',
    salesStartDatetime: '',
    hidden: false,
  };
}

export function formTicketFromEvent(t, ticketMode) {
  const price = Number(t.price) || 0;
  const orig = Number(t.originalPrice) || 0;
  const minAge = t.minAge == null || t.minAge === '' ? '' : String(t.minAge);
  return {
    id: t.id || uid('t'),
    name: t.name || '',
    price: price > 0 ? price : '',
    originalPrice: orig > 0 ? orig : '',
    capacity: t.capacity === 0 || t.capacity ? t.capacity : '',
    seatsPerTicket: Math.max(1, Math.floor(Number(t.seatsPerTicket) || 1)),
    description: t.description || '',
    paymentMode:
      ticketMode === 'at_door'
        ? 'at_door'
        : t.paymentMode === 'at_door'
          ? 'at_door'
          : 'online',
    audienceGender: t.audienceGender === 'female' || t.audienceGender === 'male' ? t.audienceGender : 'any',
    minAge: AGE_OPTIONS.some((o) => o.id === minAge) ? minAge : minAge,
    salesStartDatetime: t.salesStartDatetime || '',
    hidden: t.hidden === true,
    sold: Math.max(0, Number(t.sold) || 0),
    sortOrder: t.sortOrder,
  };
}

export function ticketsValid(list) {
  if (!list.length) return false;
  return list.every((t) => {
    if (!String(t.name || '').trim()) return false;
    if (!(Number(t.price) > 0)) return false;
    if (!(Number(t.capacity) > 0)) return false;
    if (!(Number(t.seatsPerTicket) >= 1)) return false;
    const orig = Number(t.originalPrice) || 0;
    if (orig > 0 && orig <= Number(t.price)) return false;
    const sold = Number(t.sold) || 0;
    if (Number(t.capacity) < sold) return false;
    return true;
  });
}

export function serializeTickets(list, ticketMode) {
  return list.map((t, index) => {
    const price = Math.max(0, Number(t.price) || 0);
    const originalPrice = Math.max(0, Number(t.originalPrice) || 0);
    const label = ticketDiscountLabel(price, originalPrice);
    const minAgeRaw = t.minAge === '' || t.minAge == null ? undefined : Number(t.minAge);
    return {
      id: t.id,
      name: String(t.name || '').trim(),
      price,
      capacity: Math.max(0, Number(t.capacity) || 0),
      sold: Math.max(0, Number(t.sold) || 0),
      originalPrice: originalPrice > price ? originalPrice : undefined,
      discountLabel: label || undefined,
      seatsPerTicket: Math.max(1, Math.floor(Number(t.seatsPerTicket) || 1)),
      description: String(t.description || '').trim() || undefined,
      paymentMode: ticketMode === 'at_door' ? 'at_door' : t.paymentMode === 'at_door' ? 'at_door' : 'online',
      audienceGender: t.audienceGender === 'female' || t.audienceGender === 'male' ? t.audienceGender : 'any',
      minAge: Number.isFinite(minAgeRaw) ? minAgeRaw : undefined,
      salesStartDatetime: t.salesStartDatetime || undefined,
      hidden: t.hidden === true,
      sortOrder: index,
    };
  });
}

export function ticketSummary(t) {
  const bits = [];
  const price = Number(t.price) || 0;
  if (price) bits.push(`${price.toLocaleString('ru-RU')} UZS`);
  bits.push(paymentModeLabel(t.paymentMode));
  if (t.hidden) bits.push('скрыт');
  const gender = genderLabel(t.audienceGender);
  if (gender !== 'Любой') bits.push(gender);
  const age = ageLabel(t.minAge);
  if (age !== 'Любой') bits.push(age);
  return bits.join(' · ');
}

export function attendeeSourceOf(att, event) {
  if (att?.source === 'invited' || att?.source === 'purchased' || att?.source === 'registered') {
    return att.source;
  }
  if (att?.type === 'invited' || att?.type === 'Invited') return 'invited';
  if (event?.isFree || event?.ticketMode === 'free') return 'registered';
  return 'purchased';
}

export const SOURCE_LABEL = {
  invited: 'Приглашён',
  purchased: 'Купил',
  registered: 'Регистрация',
};
