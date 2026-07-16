import { useState } from 'react';
import { List, Placeholder, Section, SegmentedControl } from '@telegram-apps/telegram-ui';
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
      <List className="fm-page-list">
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
          <Section header={filter === 'new' ? 'Новые' : 'Все заказы'}>
            {filtered.map((order) => (
              <EntityListRow
                key={order.id}
                glyph="🧾"
                title={`${order.receipt} · ${orderStatusLabel(order.status)}`}
                subtitle={`${order.buyer?.phone || '—'} · ${formatPrice(order.amount)}`}
                onClick={() => push(SCREENS.SALE_DETAIL, { orderId: order.id })}
              />
            ))}
          </Section>
        ) : (
          <Placeholder
            header={filter === 'new' ? 'Новых заказов нет' : 'Заказов пока нет'}
            description="Появятся после первых продаж"
          />
        )}
      </List>
    </SubpageLayout>
  );
}
