/** UZ mobile mask — same rules as web `src/utils/uzPhoneMask.ts` */

const UZ_MOBILE_DIGITS = 9;

export function parseUzMobileDigits(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  return d.slice(0, UZ_MOBILE_DIGITS);
}

export function formatUzMobileMask(input) {
  const d = parseUzMobileDigits(input);
  if (d.length === 0) return '+998 ';
  if (d.length <= 2) return `+998 ${d}`;
  if (d.length <= 5) return `+998 ${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 7) return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
}

export function isCompleteUzMobile(nationalDigits) {
  return parseUzMobileDigits(nationalDigits).length === UZ_MOBILE_DIGITS;
}

export function uzPhoneNationalDigitsToE164(nationalDigits) {
  const d = parseUzMobileDigits(nationalDigits);
  return d.length === UZ_MOBILE_DIGITS ? `+998${d}` : '';
}
