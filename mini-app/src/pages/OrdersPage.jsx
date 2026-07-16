import { useState } from 'react';
import { SegmentedControl } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { formatPrice, orderStatusLabel } from '../utils.js';
import { haptic } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

export function OrdersPage({ snapshot, push }) {
  const [filter, setFilter] = useState('new');
  const orders = snapshot.orders || [];

  const filtered = orders.filter((o) => {
    if (filter === 'new') return o.status === 'pending';
    return true;
  }).slice().reverse();

  return (
    <SubpageLayout>
      <PageHeader title="Продажи" subtitle={`${orders.length} всего`} />
      <div className="fm-page-body">
        <div className="fm-segment-wrap fm-segment-wrap--media">
          <SegmentedControl>
            <SegmentedControl.Item
              selected={filter === 'new'}
              onClick={() => { setFilter('new'); haptic('selection'); }}
            >
              Новые
            </SegmentedControl.Item>
            <SegmentedControl.Item
              selected={filter === 'all'}
              onClick={() => { setFilter('all'); haptic('selection'); }}
            >
              Все
            </SegmentedControl.Item>
          </SegmentedControl>
        </div>

        {filtered.length > 0 ? (
          <div className="fm-inset-card fm-entity-list">
            {filtered.map((order, index) => (
              <EntityListRow
                key={order.id}
                glyph="🧾"
                title={`${order.receipt} · ${orderStatusLabel(order.status)}`}
                subtitle={`${order.buyer?.phone || '—'} · ${formatPrice(order.amount)}`}
                last={index === filtered.length - 1}
                onClick={() => push(SCREENS.ORDER_DETAIL, { orderId: order.id })}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">
            {filter === 'new' ? 'Новых заказов нет' : 'Заказов пока нет'}
          </p>
        )}
      </div>
    </SubpageLayout>
  );
}
