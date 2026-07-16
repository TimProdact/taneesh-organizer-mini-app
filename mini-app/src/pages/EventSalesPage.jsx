import { useMemo, useState } from 'react';
import { Button, Input, SegmentedControl } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { formatPrice } from '../utils.js';
import { copyText, haptic, showError } from '../api.js';

function formatSaleDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EventSalesPage({ snapshot, eventId }) {
  const event = useMemo(() => {
    const list = snapshot.events || [];
    return list.find((e) => e.id === eventId) || {};
  }, [snapshot, eventId]);

  const sales = event.sales || [];
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const selected = sales.find((s) => s.id === selectedId) || null;

  const paid = sales.filter((s) => s.status === 'paid');
  const refunded = sales.filter((s) => s.status === 'refunded');
  const totalPaid = paid.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalRefund = refunded.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const payout = Math.max(0, totalPaid - totalRefund);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter((s) => {
      if (status === 'paid' && s.status !== 'paid') return false;
      if (status === 'refunded' && s.status !== 'refunded') return false;
      if (!q) return true;
      return (
        String(s.buyer || '').toLowerCase().includes(q)
        || String(s.paylovId || '').toLowerCase().includes(q)
      );
    });
  }, [sales, status, query]);

  return (
    <SubpageLayout>
      <PageHeader title="Продажи" subtitle={event.name || ''} />
      <div className="fm-page-body">
        <div className="fm-metrics-grid fm-metrics-grid--3">
          <div className="fm-metric-tile">
            <span className="fm-metric-value">{paid.length}</span>
            <span className="fm-metric-label">Всего продаж</span>
          </div>
          <div className="fm-metric-tile">
            <span className="fm-metric-value">{formatPrice(totalRefund)}</span>
            <span className="fm-metric-label">Возвраты</span>
          </div>
          <div className="fm-metric-tile">
            <span className="fm-metric-value">{formatPrice(payout)}</span>
            <span className="fm-metric-label">К выплате</span>
          </div>
        </div>

        <Input
          header="Поиск"
          placeholder="Email, телефон, Paylov ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="fm-segment-wrap fm-segment-wrap--media">
          <SegmentedControl>
            {[
              { id: 'all', label: 'Все' },
              { id: 'paid', label: 'Оплачено' },
              { id: 'refunded', label: 'Возврат' },
            ].map((f) => (
              <SegmentedControl.Item
                key={f.id}
                selected={status === f.id}
                onClick={() => { setStatus(f.id); haptic('selection'); }}
              >
                {f.label}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        </div>

        {filtered.length ? (
          <div className="fm-inset-card fm-entity-list">
            {filtered.map((s, index) => (
              <EntityListRow
                key={s.id}
                glyph={s.status === 'paid' ? '💳' : '↩️'}
                title={s.buyer || 'Покупатель'}
                subtitle={`${formatSaleDate(s.date)} · ${formatPrice(s.amount)} · ${
                  s.status === 'paid' ? 'Оплачено' : 'Возврат'
                }`}
                last={index === filtered.length - 1}
                onClick={() => {
                  haptic('selection');
                  setSelectedId(s.id);
                }}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">Продаж пока нет</p>
        )}
      </div>

      <BottomSheet
        open={Boolean(selected)}
        title={selected?.buyer || 'Заказ'}
        subtitle={selected ? formatPrice(selected.amount) : ''}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <div className="fm-action-list">
            <p className="fm-empty-hint" style={{ marginTop: 0 }}>
              {formatSaleDate(selected.date)} · {selected.paylovId || '—'}
            </p>
            {selected.paylovId ? (
              <Button mode="outline" size="l" stretched onClick={() => copyText(selected.paylovId)}>
                Скопировать Paylov ID
              </Button>
            ) : null}
            {selected.status === 'paid' ? (
              <Button
                mode="filled"
                size="l"
                stretched
                onClick={() => showError('Фискальный чек подключим к API Paylov')}
              >
                Фискальный чек
              </Button>
            ) : (
              <p className="fm-empty-hint">По возврату чек недоступен</p>
            )}
          </div>
        ) : null}
      </BottomSheet>
    </SubpageLayout>
  );
}
