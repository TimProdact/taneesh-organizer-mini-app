import { useEffect, useState, useCallback } from 'react';
import { AppRoot, Placeholder, Button } from '@telegram-apps/telegram-ui';
import { bootstrap, haptic } from './api.js';
import { useTelegramApp } from './hooks/useTelegramApp.js';
import { useNavStack } from './hooks/useNavStack.js';
import { waitForInitData, hasTelegramContext } from './telegram-init.js';
import { SCREENS } from './navigation/screens.js';
import { HubPage } from './pages/HubPage.jsx';
import { DropsListPage } from './pages/DropsListPage.jsx';
import { DropPage } from './pages/DropPage.jsx';
import { OrdersPage } from './pages/OrdersPage.jsx';
import { OrderDetailPage } from './pages/OrderDetailPage.jsx';
import { WaitlistPage } from './pages/WaitlistPage.jsx';
import { StorefrontEditPage } from './pages/StorefrontEditPage.jsx';
import { StorefrontLogoPage } from './pages/StorefrontLogoPage.jsx';
import { SocialsPage } from './pages/SocialsPage.jsx';
import { QrPage } from './pages/QrPage.jsx';
import { HubSkeleton } from './components/HubSkeleton.jsx';

export default function App() {
  const { tg, platform, appearance, ready } = useTelegramApp();
  const { current, depth, push, pop, reset } = useNavStack({ id: SCREENS.HUB, params: {} });

  const [loading, setLoading] = useState(true);
  const [loadingHint, setLoadingHint] = useState('Загрузка…');
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadingHint('Загрузка…');
    setError('');

    const init = await waitForInitData();
    if (!init) {
      const hint = hasTelegramContext()
        ? 'Сессия Telegram не передана. Закройте Mini App и откройте снова через кнопку «Админка» в @taneesh_org_bot.'
        : 'Откройте через кнопку «Админка» в боте @taneesh_org_bot (не из браузера).';
      setError(
        `${hint}\n\nBotFather → /setdomain → taneesh-organizer-api.onrender.com`,
      );
      setLoading(false);
      return;
    }

    try {
      setLoadingHint('Подключаемся к серверу…');
      const data = await bootstrap();
      setSnapshot(data.snapshot);
      reset(SCREENS.HUB);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // Каждый раз при открытии Mini App из Telegram — главный экран, не wizard.
  useEffect(() => {
    if (!tg?.onEvent) return undefined;
    const onVisible = (event) => {
      if (event?.is_visible) reset(SCREENS.HUB);
    };
    tg.onEvent('visibility_changed', onVisible);
    return () => tg.offEvent?.('visibility_changed', onVisible);
  }, [tg, reset]);

  useEffect(() => {
    if (!tg?.BackButton) return;
    if (depth > 1) {
      tg.BackButton.show();
      const handler = () => {
        haptic('light');
        pop();
      };
      tg.BackButton.onClick(handler);
      return () => { tg.BackButton.offClick(handler); tg.BackButton.hide(); };
    }
    tg.BackButton.hide();
  }, [depth, tg, pop]);

  const findOrder = (id) => snapshot?.orders?.find(o => o.id === Number(id));

  const renderScreen = () => {
    if (!snapshot) return null;
    const { id, params } = current;
    switch (id) {
      case SCREENS.HUB:
        return <HubPage snapshot={snapshot} push={push} />;
      case SCREENS.DROPS:
      case SCREENS.EVENTS:
        return (
          <DropsListPage
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            push={push}
          />
        );
      case SCREENS.DROP:
      case SCREENS.EVENT:
        return (
          <DropPage
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            dropId={params.dropId || params.eventId}
          />
        );
      case SCREENS.ORDERS:
        return <OrdersPage snapshot={snapshot} push={push} />;
      case SCREENS.ORDER_DETAIL:
        return (
          <OrderDetailPage
            order={findOrder(params.orderId)}
            onSnapshotChange={setSnapshot}
          />
        );
      case SCREENS.WAITLIST:
      case SCREENS.AUDIENCE:
        return <WaitlistPage snapshot={snapshot} />;
      case SCREENS.STOREFRONT_EDIT:
        return (
          <StorefrontEditPage
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            push={push}
          />
        );
      case SCREENS.STOREFRONT_LOGO:
        return (
          <StorefrontLogoPage
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            onDone={pop}
          />
        );
      case SCREENS.SOCIALS:
        return <SocialsPage snapshot={snapshot} onSnapshotChange={setSnapshot} />;
      case SCREENS.STORE_QR:
        return <QrPage snapshot={snapshot} />;
      default:
        return <HubPage snapshot={snapshot} push={push} />;
    }
  };

  if (loading) {
    return (
      <AppRoot appearance={appearance} platform={platform}>
        <HubSkeleton hint={loadingHint} />
      </AppRoot>
    );
  }

  if (error) {
    return (
      <AppRoot appearance={appearance} platform={platform}>
        <Placeholder header="Ошибка" description={error}>
          <Button mode="filled" size="m" onClick={load}>Повторить</Button>
        </Placeholder>
      </AppRoot>
    );
  }

  const isQr = current.id === SCREENS.STORE_QR;

  return (
    <AppRoot appearance={appearance} platform={platform}>
      <div className={`fm-twa fm-scroll fm-scroll--hub${isQr ? ' fm-scroll--qr' : ''}${depth > 1 && !isQr ? ' fm-subpage' : ''}`}>
        {renderScreen()}
      </div>
    </AppRoot>
  );
}
