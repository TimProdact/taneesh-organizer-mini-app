import { getInitData } from './telegram-init.js';

/** Same origin on Netlify: /api → function */
const API_URL =
  import.meta.env.VITE_ORGANIZER_API_URL ||
  (typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/api`
    : '/api');

function initData() {
  return getInitData();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postApi(body, attempt = 0) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 4) {
      await sleep(12000);
      return postApi(body, attempt + 1);
    }
    return res;
  } catch (error) {
    if (attempt < 4) {
      await sleep(12000);
      return postApi(body, attempt + 1);
    }
    throw error;
  }
}

async function tgApi(action, payload = {}) {
  const init = initData();
  if (!init) {
    throw new Error('Откройте админку через кнопку «Админка» в боте @taneesh_org_bot');
  }

  let res;
  try {
    res = await postApi({ action, initData: init, ...payload });
  } catch {
    throw new Error('Нет сети. Подождите минуту и нажмите «Повторить».');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || `Ошибка сервера (${res.status})`;
    if (res.status === 401) {
      throw new Error('Сессия истекла. Закройте админку и откройте заново из бота.');
    }
    throw new Error(msg);
  }
  return data;
}

export async function bootstrap() {
  return tgApi('bootstrap');
}

export async function adminAction(adminAction, payload = {}) {
  return tgApi('admin_action', { adminAction, payload });
}

export function haptic(type = 'selection') {
  const h = window.Telegram?.WebApp?.HapticFeedback;
  if (!h) return;
  if (type === 'success') h.notificationOccurred('success');
  else if (type === 'error') h.notificationOccurred('error');
  else if (type === 'light') h.impactOccurred('light');
  else h.selectionChanged();
}

export function showError(message) {
  const tg = window.Telegram?.WebApp;
  haptic('error');
  if (tg?.showAlert) tg.showAlert(String(message));
  else alert(String(message));
}

export async function runActionSafe(action, payload = {}) {
  try {
    const data = await adminAction(action, payload);
    haptic('success');
    return data.snapshot;
  } catch (e) {
    showError(e.message);
    throw e;
  }
}

export async function copyText(text) {
  const tg = window.Telegram?.WebApp;
  try {
    await navigator.clipboard.writeText(text);
    tg?.showAlert?.('Скопировано');
    haptic('success');
  } catch {
    tg?.showAlert?.('Не удалось скопировать');
  }
}
