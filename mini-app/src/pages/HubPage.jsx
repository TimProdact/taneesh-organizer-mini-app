import { Icon24QR } from '@telegram-apps/telegram-ui/dist/icons/24/qr';
import { MenuGroup, MenuRow } from '../components/MenuRow.jsx';
import { HubHeroMeta } from '../components/HubHeroMeta.jsx';
import { pendingOrders, vitrinaUrl } from '../utils.js';
import { haptic } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

export function HubPage({ snapshot, push }) {
  const tg = window.Telegram?.WebApp;
  const pending = pendingOrders(snapshot.orders);
  const storefront = snapshot.storefront || {};
  const brand = snapshot.brand || {};
  const displayName = storefront.displayName || brand.name || 'THE4';
  const avatarUrl = storefront.avatarUrl || brand.logoUrl || '';
  const logoEmoji = storefront.logoEmoji || brand.logoEmoji || '🐱';
  const products = snapshot.products || [];
  void products;
  const drops = snapshot.drops || [];
  const url = vitrinaUrl();

  const openVitrina = () => {
    haptic('light');
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  };

  return (
    <main className="fm-twa fm-home fm-hub">
      <header className="fm-hub-hero">
        <div className="fm-hub-hero-bar">
          <button
            type="button"
            className="fm-hub-hero-round-btn"
            aria-label="QR-код витрины"
            onClick={() => { haptic('light'); push(SCREENS.STORE_QR); }}
          >
            <Icon24QR />
          </button>
          <button
            type="button"
            className="fm-hub-hero-edit-btn"
            onClick={() => { haptic('selection'); push(SCREENS.STOREFRONT_EDIT); }}
          >
            Edit
          </button>
        </div>

        <div className="fm-hub-hero-center">
          <div className="fm-hub-avatar" aria-hidden>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="fm-hub-avatar-img" />
            ) : (
              <span className="fm-hub-avatar-emoji">{logoEmoji}</span>
            )}
          </div>
          <h1 className="fm-hub-title">{displayName}</h1>
          <HubHeroMeta snapshot={snapshot} />
        </div>
      </header>

      <div className="fm-hub-stack">
        <MenuGroup>
          <MenuRow
            label="Мероприятия"
            glyph="📅"
            tone="#007aff"
            value={String(snapshot.meta?.eventsCount ?? drops.length)}
            onClick={() => push(SCREENS.DROPS)}
          />
          <MenuRow
            label="Аудитория"
            glyph="👥"
            tone="#af52de"
            value={String(snapshot.meta?.audienceCount ?? 0)}
            onClick={() => push(SCREENS.WAITLIST)}
          />
          <MenuRow
            label="Контролеры"
            glyph="📷"
            tone="#ff9500"
            value={String(snapshot.meta?.controllersCount ?? 0)}
            onClick={() => push(SCREENS.ORDERS)}
          />
          <MenuRow
            label="Финансы"
            glyph="💳"
            tone="#34c759"
            badge={pending.length || undefined}
            onClick={() => push(SCREENS.ORDERS)}
            last
          />
        </MenuGroup>

        <div className="fm-hub-cta">
          <button type="button" className="fm-hub-cta-btn" onClick={openVitrina}>
            Открыть страницу
          </button>
        </div>
      </div>

      <footer className="fm-hub-footer">
        <span>@taneesh_org_bot</span>
      </footer>
    </main>
  );
}
