# Organizer Mini App — где ещё остались «магазин / дропы / товары»

> Дата: 16.07.2026  
> После релейбла UI под ивенты. **Пользователь в Hub больше не видит** «Товары / Дропы / Waitlist / витрина».  
> Ниже — технический долг: файлы и поля, которые ещё shop-shaped.

---

## Уже адаптировано (видимый UI)

| Было | Стало |
|------|--------|
| Hub: Товары / Дропы / Заказы / Waitlist | Мероприятия / Аудитория / Контролеры / Финансы |
| «1 предроп» | «1 скоро» |
| Список «Дропы» | «Мероприятия» |
| Карточка «Дроп» | «Мероприятие» + билеты |
| Waitlist | Аудитория |
| Заказы | Продажи |
| Товар / Издание в заказе | Ивент / Тип билета |
| Витрина | Страница |
| Wizard «Новый дроп» + выбор товара | «Новое мероприятие» (название, дата, билеты) |
| Bio под названием на Hub | Убрано |

---

## Осталось старое (техдолг)

### 1. Файлы магазина — лежат в репо, **не подключены к Hub**

| Файл | Что внутри |
|------|------------|
| `mini-app/src/pages/CatalogPage.jsx` | «Товары», каталог |
| `mini-app/src/pages/ProductPage.jsx` | «Товар», контент витрины |
| `mini-app/src/pages/ProductMediaPage.jsx` | 3D/фото для витрины |
| `mini-app/src/pages/AnalyticsPage.jsx` | orphan analytics |
| `mini-app/src/pages/BrandEditPage.jsx` | orphan brand |
| `mini-app/src/config/productModels.js` | URL `timprodact.github.io/the4` + 3D модели |
| `mini-app/src/components/ProductListRow.jsx` | строка товара |
| `mini-app/src/components/ProductPreview.jsx` | превью товара |
| `mini-app/CONTENT-RULES.md` | правила the4 про дропы/товары |

**Статус:** вырезаны из `App.jsx` router. Можно удалить в следующей итерации.

### 2. Имена файлов / screen id — shop-имена, UI уже event

| Код | Комментарий |
|-----|-------------|
| `DropsListPage.jsx` | UI = Мероприятия |
| `DropPage.jsx` | UI = Мероприятие |
| `LaunchDropSheet.jsx` | UI = Новое мероприятие |
| `WaitlistPage.jsx` | UI = Аудитория |
| `SCREENS.DROPS` / `DROP` / `WAITLIST` | есть алиасы `EVENTS` / `EVENT` / `AUDIENCE` |
| CSS classes `fm-waitlist-*`, `pre-drop` tone | визуальные токены, не тексты |

### 3. Данные / API shape (snapshot)

В `server/organizer-store.mjs` сейчас:

| Поле | Зачем |
|------|--------|
| `events[]` | **канон** для ивентов |
| `drops` | **alias** = `events` (чтобы старые экраны не падали) |
| `products: []` | пустой массив, заглушка |
| `audience[]` | канон CRM |
| `waitlist` | alias = `audience` |
| `phase: 'pre_drop' \| 'active' \| 'sold_out'` | старые ключи phase; **лейблы** уже event |
| `stock` / `totalStock` | по смыслу = билеты, имена полей старые |
| `orders[]` | модель заказа магазина (buyer, productName…) |
| `storefront` | профиль орга (ещё зовётся storefront) |

### 4. Утилиты с shop-именами

| Функция | Файл |
|---------|------|
| `formatDropDate` / `formatDropDateOnly` / `formatDropTimeOnly` | `utils.js` |
| `resolveDropState` / `dropStatusTone` | `utils.js` |
| `productThumb` / `productAcronym` | `utils.js` |
| `vitrinaUrl` / `vitrinaHost` | `utils.js` (по смыслу = public page URL) |
| `phase` key `pre_drop` | внутри статусов |

### 5. Экраны с неправильной логикой (плейсхолдеры)

| Hub пункт | Куда ведёт сейчас | Что нужно |
|-----------|-------------------|-----------|
| Контролеры | `OrdersPage` (Продажи) | отдельный Controllers UI |
| Финансы | `OrdersPage` (Продажи) | Payouts / KYC / документы |
| Аудитория | список contacts stub | CRM как в ORGANIZER-ADMIN-SPEC |

### 6. Бэкенд

- Нет реального Taneesh API — in-memory store на Render (сбрасывается при рестарте/сне).
- Actions: `create_event`, `set_starts_at`, `set_stock`, `set_paused`, `update_storefront` — демо.
- Auth: Telegram initData + `/login` + `TELEGRAM_ORGANIZER_IDS`.

---

## Приоритет чистки (следующими шагами)

1. Удалить dead files: Catalog / Product / ProductMedia / productModels / orphan pages.  
2. Rename файлов: `DropsListPage` → `EventsListPage`, `DropPage` → `EventPage`, и т.д.  
3. Snapshot: убрать `drops`/`products`/`waitlist`, оставить только `events`/`audience`/`orders`/`controllers`.  
4. Phase keys: `upcoming` / `live` / `sold_out` / `paused` (миграция лейблов уже есть).  
5. Отдельные экраны Контролеры + Финансы.  
6. Подключить Taneesh backend вместо in-memory.

---

## Где смотреть код

- Mini App: `organizer-mini-app/mini-app/`  
- API: `organizer-mini-app/server/`  
- Прод: https://taneesh-organizer-api.onrender.com/mini-app/  
- План переноса: `docs/THE4-TO-ORGANIZER-ADMIN-PLAN.md`
