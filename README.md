# Taneesh Organizer — Telegram Mini App

Отдельный бот: **@taneesh_org_bot**

## Публичный деплой — Render (основной)

Сервис уже поднят:

| | URL |
|--|-----|
| API / health | https://taneesh-organizer-api.onrender.com/health |
| Mini App | https://taneesh-organizer-api.onrender.com/mini-app/ |
| Webhook | https://taneesh-organizer-api.onrender.com/telegram/webhook |
| Dashboard | https://dashboard.render.com/web/srv-d9ccu39kh4rs73ci64f0 |

```bash
cd organizer-mini-app
# токен в .env (не коммитить)
npm run deploy          # = Render: push + redeploy + setup telegram
```

Env на Render: `TELEGRAM_BOT_TOKEN`, `ADMIN_PASSWORD`, `TELEGRAM_ORGANIZER_IDS`.

> Netlify не используем (лимиты сайтов). Скрипт `deploy-netlify.mjs` — legacy.

## Привязка Telegram → организатор

1. Открой @taneesh_org_bot  
2. `/login <пароль>` (из `ADMIN_PASSWORD` в `.env` / Render env)  
3. `/whoami` — проверка  
4. Кнопка **Админка**

Либо заранее: `TELEGRAM_ORGANIZER_IDS=123456789` в Render env.

## Локально

```bash
npm install && npm install --prefix mini-app
npm start                 # API + static на :8788
npm run dev:mini-app      # только Vite UI
```

Для Telegram нужен публичный HTTPS — поэтому прод = Render.
