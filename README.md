# Taneesh Organizer — Telegram Mini App

Отдельный бот: **@taneesh_org_bot**

## Публичный деплой (Netlify)

```bash
cd organizer-mini-app
# токен уже в .env (не коммитить)
npm run deploy
```

Поднимает:
- Mini App: `https://<site>/mini-app/`
- API: `https://<site>/api`
- Webhook: `https://<site>/telegram/webhook`
- Menu button «Админка» + команды бота

## Привязка Telegram → организатор

1. Открой @taneesh_org_bot
2. `/login <пароль>` (пароль из `ADMIN_PASSWORD` в `.env` / Netlify env)
3. `/whoami` — проверка доступа
4. Кнопка **Админка** внизу чата

Либо заранее: `TELEGRAM_ORGANIZER_IDS=123456789` в env (через запятую).

## Локально

```bash
npm install && npm install --prefix mini-app
npm run dev:mini-app
# API локально позже; для полного флоу нужен публичный HTTPS (Telegram требование)
```
