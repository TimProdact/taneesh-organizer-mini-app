import { useState } from 'react';
import { Button, List } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
import { deliveryTypeLabel, formatPrice, orderStatusLabel } from '../utils.js';
import { runActionSafe } from '../api.js';

export function OrderDetailPage({ order, onSnapshotChange }) {
  const [shipSheet, setShipSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!order) return null;

  const date = new Date(order.createdAt).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  const act = async (adminAction, payload = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe(adminAction, { orderId: order.id, ...payload });
      onSnapshotChange(next);
    } finally {
      setBusy(false);
    }
  };

  const canShip = order.status === 'pending' || order.status === 'paid';
  const canCancel = ['pending', 'paid', 'shipped'].includes(order.status);
  const showCta = canShip || canCancel;

  const saveShipment = async (raw) => {
    const deliveryUrl = raw.trim();
    if (!deliveryUrl) throw new Error('Введите ссылку на доставку');
    await act('confirm_shipment', { deliveryUrl });
    setShipSheet(false);
  };

  const cancelOrder = async () => {
    await act('cancel_order');
  };

  return (
    <SubpageLayout stickyCta={showCta}>
      <PageHeader title="Заказ" subtitle={date} />
      <List className="fm-page-list">
        <ValueGroup header="Заказ">
          <ValueRow label="Статус" value={orderStatusLabel(order.status)} muted />
          <ValueRow label="Чек" value={order.receipt} />
        </ValueGroup>

        <ValueGroup header="Покупатель">
          <ValueRow label="Имя" value={order.buyer?.name || '—'} />
          <ValueRow label="Телефон" value={order.buyer?.phone || '—'} />
          <ValueRow label="Доставка" value={deliveryTypeLabel(order.buyer?.deliveryType)} />
          <ValueRow label="Адрес" value={order.buyer?.address || '—'} />
        </ValueGroup>

        <ValueGroup header="Оплата">
          <ValueRow label="Ивент" value={order.eventName || order.productName || '—'} />
          <ValueRow label="Тип билета" value={order.ticketType || order.edition || '—'} />
          <ValueRow label="Сумма" value={formatPrice(order.amount)} />
          <ValueRow label="Оплата" value={order.paymentMethod || '—'} />
        </ValueGroup>

        {order.deliveryUrl ? (
          <ValueGroup header="Доставка">
            <ValueRow label="Яндекс Доставка" value={order.deliveryUrl} />
          </ValueGroup>
        ) : null}

        {order.refundId ? (
          <ValueGroup>
            <ValueRow label="Возврат" value={order.refundId} />
          </ValueGroup>
        ) : null}
      </List>

      {showCta ? (
        <StickyPageCta>
          {canShip ? (
            <Button
              mode="filled"
              size="l"
              stretched
              disabled={busy}
              onClick={() => setShipSheet(true)}
            >
              Подтвердить отправку
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              mode="plain"
              size="l"
              stretched
              className="fm-btn-destructive"
              disabled={busy}
              onClick={cancelOrder}
            >
              Отменить заказ и вернуть деньги
            </Button>
          ) : null}
        </StickyPageCta>
      ) : null}

      <FieldSheet
        open={shipSheet}
        title="Ссылка Яндекс Доставки"
        value={order.deliveryUrl || ''}
        placeholder="https://dostavka.yandex.ru/..."
        onClose={() => setShipSheet(false)}
        onSave={saveShipment}
      />
    </SubpageLayout>
  );
}
