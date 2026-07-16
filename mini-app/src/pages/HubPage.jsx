import {
  Avatar,
  Badge,
  Banner,
  Button,
  Cell,
  IconButton,
  List,
  Navigation,
  Section,
} from '@telegram-apps/telegram-ui';
import { Icon24QR } from '@telegram-apps/telegram-ui/dist/icons/24/qr';
import { HubHeroMeta } from '../components/HubHeroMeta.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { MenuGroup } from '../components/MenuRow.jsx';
import { pendingOrders, profileOf, publicPageUrl } from '../utils.js';
import { haptic } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

/** Sidebar labels from admin `AppSidebar.tsx` + Legal documents block */
function kycBannerCopy(status) {
  if (status === 'pending') {
    return {
      header: 'KYC на проверке',
      description: 'Заявка у модератора · обычно до 24 часов',
    };
  }
  if (status === 'rejected') {
    return {
      header: 'KYC отклонён',
      description: 'Исправьте данные и отправьте снова во вкладке Реквизиты',
    };
  }
  return {
    header: 'Требуется верификация',
    description: 'Для платных событий и выплат подтвердите данные (как в админке → Реквизиты)',
  };
}

function MenuIcon({ tone, children }) {
  return (
    <span className="fm-hub-cell-icon" style={{ backgroundColor: tone }} aria-hidden>
      {children}
    </span>
  );
}

export function HubPage({ snapshot, push }) {
  const tg = window.Telegram?.WebApp;
  const pending = pendingOrders(snapshot.orders);
  const profile = profileOf(snapshot);
  const displayName = profile.displayName || profile.name || 'Taneesh Organizer';
  const avatarUrl = profile.avatarUrl || profile.logoUrl || '';
  const logoEmoji = profile.logoEmoji || '🎟️';
  const events = snapshot.events || [];
  const url = publicPageUrl();
  const kycStatus =
    profile.kycStatus || (profile.verified || snapshot.meta?.verified ? 'approved' : 'idle');
  const showKyc = kycStatus !== 'approved';
  const kycCopy = kycBannerCopy(kycStatus);

  const openPublicPage = () => {
    haptic('light');
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  };

  const go = (screen, params) => {
    haptic('selection');
    push(screen, params);
  };

  return (
    <main className="fm-twa fm-home fm-hub fm-hub--sticky-cta">
      <header className="fm-hub-hero">
        <div className="fm-hub-hero-bar">
          <IconButton
            mode="bezeled"
            size="m"
            aria-label="QR-код страницы"
            onClick={() => go(SCREENS.ORG_QR)}
          >
            <Icon24QR />
          </IconButton>
          <Button
            mode="bezeled"
            size="s"
            onClick={() => go(SCREENS.PROFILE_EDIT)}
          >
            Edit
          </Button>
        </div>

        <div className="fm-hub-hero-center">
          <Avatar
            size={96}
            src={avatarUrl || undefined}
            fallbackIcon={
              avatarUrl ? undefined : (
                <span className="fm-hub-avatar-emoji">{logoEmoji}</span>
              )
            }
            className="fm-hub-avatar-tgui"
          />
          <h1 className="fm-hub-title">{displayName}</h1>
          <HubHeroMeta snapshot={snapshot} />
        </div>
      </header>

      <List className="fm-hub-list">
        {showKyc ? (
          <Banner
            type="section"
            header={kycCopy.header}
            description={kycCopy.description}
            onClick={() => go(SCREENS.KYC)}
            className="fm-hub-kyc-banner"
          >
            <Button
              size="s"
              mode="filled"
              onClick={(e) => {
                e.stopPropagation();
                go(SCREENS.KYC);
              }}
            >
              Реквизиты
            </Button>
          </Banner>
        ) : null}

        <Section>
          <Cell
            className="fm-tgui-cell"
            before={<MenuIcon tone="#007aff">📅</MenuIcon>}
            after={(
              <Navigation>
                {String(snapshot.meta?.eventsCount ?? events.length)}
              </Navigation>
            )}
            onClick={() => go(SCREENS.EVENTS)}
          >
            Мероприятия
          </Cell>
          <Cell
            className="fm-tgui-cell"
            before={<MenuIcon tone="#af52de">👥</MenuIcon>}
            after={(
              <Navigation>
                {String(snapshot.meta?.audienceCount ?? 0)}
              </Navigation>
            )}
            onClick={() => go(SCREENS.AUDIENCE)}
          >
            Аудитория (CRM)
          </Cell>
          <Cell
            className="fm-tgui-cell"
            before={<MenuIcon tone="#ff9500">📷</MenuIcon>}
            after={(
              <Navigation>
                {String(snapshot.meta?.controllersCount ?? 0)}
              </Navigation>
            )}
            onClick={() => go(SCREENS.CONTROLLERS)}
          >
            Контролеры
          </Cell>
          <Cell
            className="fm-tgui-cell"
            before={<MenuIcon tone="#34c759">💳</MenuIcon>}
            after={(
              <Navigation>
                {pending.length > 0 ? (
                  <Badge type="number">{pending.length}</Badge>
                ) : null}
              </Navigation>
            )}
            onClick={() => go(SCREENS.FINANCE)}
          >
            Финансы
          </Cell>
        </Section>

        <MenuGroup header="Юридическое">
          <Cell
            className="fm-tgui-cell"
            before={<MenuIcon tone="#8e8e93">📄</MenuIcon>}
            after={<Navigation />}
            onClick={() => go(SCREENS.DOCUMENTS)}
          >
            Документы
          </Cell>
        </MenuGroup>
      </List>

      <StickyPageCta>
        <Button mode="filled" size="l" stretched onClick={openPublicPage}>
          Открыть страницу
        </Button>
        <footer className="fm-hub-footer">
          <span>@taneesh_org_bot</span>
        </footer>
      </StickyPageCta>
    </main>
  );
}
