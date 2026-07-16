---
description: THE4 / Pocket Pals mini-app content, layout, and UX rules
globs: admin/mini-app/**
---

# Mini-app — правила контента и UX

## Принципы

- Админка = Telegram Settings. Не форма, не wizard при открытии.
- Редактирование: экран-обзор + строки + FieldSheet (одно поле) + автосохранение.
- Сложный выбор (картинка, логотип) → отдельный экран.
- Wizard только при создании дропа (LaunchDropSheet).
- Нет кнопки «Сохранить» на экранах редактирования.
- Список и primary CTA всегда визуально разделены (`fm-page-cta--separated`, 20px).

## Открытие

- Старт и возврат из фона → Hub.

## Layout экрана

```
PageHeader (title + subtitle-счётчик)
fm-page-body
  [контент: fm-inset-card / ValueGroup / empty hint]
  fm-page-cta fm-page-cta--separated (если есть действие)
```

## Компоненты

- `ValueGroup` — карточка со строками
- `ValueRow` — лейбл | значение | ›
- `StepperRow` — лейбл | stepper
- `SwitchRow` — лейбл | switch
- `FieldSheet` — одно поле + «Готово»
- `LaunchDropSheet` — создание дропа (3 шага)
- `ProductPreview` — превью товара
- `EntityListRow` — строка списка: иконка + заголовок + подзаголовок + › по центру
- `ProductListRow` — как EntityListRow, но с квадратным превью товара 52×52
- `HubHeroMeta` — статус дропа + метрики под названием на Hub

## Флоу

- Товар: каталог → + → ProductPage (sheet «Название») → строки + sheets; картинка → ProductMediaPage (тумблер 3D|Фото).
- Дроп: список → + → LaunchDropSheet; редактирование → DropPage (строки + sheets, stepper, switch).
- Витрина: Hub Edit → StorefrontEditPage (строки + sheets); логотип → StorefrontLogoPage (только фото); соцсети → SocialsPage (строки + FieldSheet + SwitchRow).
- QR: TikTok-карточка на весь viewport — без скролла, без кнопки закрытия, без подписи под QR; назад — системная стрелка Telegram.
- Hub: hero (аватар + название) без ссылки на витрину; ссылка — только QR-экран и кнопка «Открыть витрину».

## Hub hero — под названием

**Не показывать:** URL витрины, копирование ссылки (есть на QR-экране и в CTA).

**Можно показывать (одно или комбо):**

| Вариант | Пример | Данные |
| --- | --- | --- |
| Описание бренда | «Коротко о бренде и дропе» | `storefront.bio` |
| Статус дропа | Идёт продажа / До старта / Распродано / Пауза | `phase`, `paused` |
| Остаток | 12 из 50 | `stock`, `totalStock` |
| Старт дропа | 15 июля, 20:00 | `startsAt` |
| Активный товар | Silk Repair Serum | `product.name` |
| Заказы | 3 новых | `orders` (pending) |
| Waitlist | 24 в очереди | `waitlist.length` |
| Выручка | 1,2 млн UZS | сумма `orders` (нужен расчёт) |

**Сейчас:** счётчик статусов по всем дропам + вторая строка (заказы · waitlist) + `bio`.

Пример: `2 активен · 1 предроп · 1 распродан` → `1 новый заказ`

Порядок сегментов: активен → предроп → распродан → пауза.  
Цвет строки — по приоритету: активен > пауза > предроп > распродан.

## Экраны

| Экран | Паттерн | Статус |
| --- | --- | --- |
| Hub | Hero: счётчик статусов дропов + заказы/waitlist + bio | ✅ |
| CatalogPage | `ProductListRow` + `EntityListRow` паттерн | ✅ |
| ProductPage | ValueGroup + FieldSheet | ✅ |
| ProductMediaPage | Тумблер 3D \| Фото + отдельный экран | ✅ |
| DropsListPage | Список + LaunchDropSheet; карточка как заказ (`EntityListRow`) | ✅ |
| DropPage | ValueGroup + sheets + stepper + switch | ✅ |
| QrPage | TikTok-карточка, viewport без скролла, без close/бренда под QR | ✅ |
| OrdersPage | Список в inset-card; `EntityListRow` | ✅ |
| OrderDetailPage | ValueGroup + подтверждение отправки (Яндекс) + отмена с возвратом | ✅ |
| WaitlistPage | Список в inset-card | ✅ |
| StorefrontEditPage | Обзор + ValueGroup + FieldSheet | ✅ |
| StorefrontLogoPage | Квадратное превью + ссылка на фото | ✅ |
| SocialsPage | ValueGroup на платформу + FieldSheet + SwitchRow | ✅ |

## Отступы

- `--fm-space-page: 20px`
- Строка: padding `14px 16px`
- Между ValueGroup: `12px` (`.fm-value-group--spaced`)

## Тексты

- Кнопки: «+ Добавить товар», «+ Запустить дроп», «Готово», «Далее →», «Скопировать», «Поделиться».
- Статусы дропа: До старта / Идёт продажа / Распродано / Пауза — не обрезать.
