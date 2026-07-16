/** Read Telegram initData from WebApp API or URL hash (#tgWebAppData=…). */
export function getInitData() {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) return tg.initData;

  const hash = window.location.hash?.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash || '';
  if (!hash) return '';

  const params = new URLSearchParams(hash);
  const raw = params.get('tgWebAppData');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function hasTelegramContext() {
  return Boolean(window.Telegram?.WebApp);
}

/** Wait for Telegram SDK + initData (fixes race on cold start). */
export function waitForInitData(maxMs = 10000) {
  return new Promise(resolve => {
    const deadline = Date.now() + maxMs;

    const finish = () => {
      const data = getInitData();
      if (data) {
        resolve(data);
        return true;
      }
      return false;
    };

    const tick = () => {
      if (finish()) return;
      if (Date.now() >= deadline) {
        resolve('');
        return;
      }
      setTimeout(tick, 50);
    };

    const start = () => {
      window.Telegram?.WebApp?.ready();
      tick();
    };

    if (window.Telegram?.WebApp) start();
    else {
      let waited = 0;
      const waitSdk = () => {
        if (window.Telegram?.WebApp) start();
        else if (waited >= maxMs) resolve('');
        else {
          waited += 50;
          setTimeout(waitSdk, 50);
        }
      };
      waitSdk();
    }
  });
}
