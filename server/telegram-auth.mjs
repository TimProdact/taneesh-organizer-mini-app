import { isValid, parse } from '@telegram-apps/init-data-node';

export function validateInitData(initData, botToken, maxAgeSec = 604800) {
  if (!initData || !botToken) return null;

  try {
    if (!isValid(initData, botToken, { expiresIn: maxAgeSec })) return null;
    const data = parse(initData);
    if (!data.user?.id) return null;
    return {
      user: data.user,
      authDate: data.auth_date instanceof Date
        ? Math.floor(data.auth_date.getTime() / 1000)
        : Number(data.auth_date),
    };
  } catch {
    return null;
  }
}
