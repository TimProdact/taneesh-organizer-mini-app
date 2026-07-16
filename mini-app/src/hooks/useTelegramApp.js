import { useEffect, useState } from 'react';
import { getInitData } from '../telegram-init.js';

const THEME_KEYS = [
  'bg_color',
  'text_color',
  'hint_color',
  'link_color',
  'button_color',
  'button_text_color',
  'secondary_bg_color',
  'header_bg_color',
  'accent_text_color',
  'section_bg_color',
  'section_header_text_color',
  'subtitle_text_color',
  'destructive_text_color',
];

function applyTelegramTheme(webApp) {
  const tp = webApp.themeParams || {};
  const root = document.documentElement;
  THEME_KEYS.forEach((key) => {
    const val = tp[key];
    if (val) root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, val);
  });
  const canvas = tp.secondary_bg_color || tp.bg_color;
  if (canvas) {
    document.documentElement.style.background = canvas;
    document.body.style.background = canvas;
  }
  if (tp.bg_color) webApp.setBackgroundColor(tp.secondary_bg_color || tp.bg_color);
  if (tp.secondary_bg_color || tp.header_bg_color) {
    webApp.setHeaderColor(tp.secondary_bg_color || tp.header_bg_color);
  }
  root.dataset.tguiPlatform = webApp.platform === 'ios' ? 'ios' : 'android';
}

export function useTelegramApp() {
  const [ready, setReady] = useState(false);
  const [tg, setTg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + 8000;

    const finish = (webApp) => {
      if (cancelled) return;
      if (webApp) {
        webApp.ready();
        webApp.expand();
        if (webApp.disableVerticalSwipes) webApp.disableVerticalSwipes();
        applyTelegramTheme(webApp);
        setTg(webApp);
      }
      setReady(true);
    };

    const tick = () => {
      const webApp = window.Telegram?.WebApp;
      if (webApp) {
        finish(webApp);
        return;
      }
      if (Date.now() >= deadline) {
        finish(null);
        return;
      }
      setTimeout(tick, 50);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, []);

  const platform = tg?.platform === 'ios' ? 'ios' : 'base';
  const appearance = tg?.colorScheme === 'light' ? 'light' : 'dark';
  const initData = ready ? getInitData() : '';

  return { tg, platform, appearance, ready, initData };
}
