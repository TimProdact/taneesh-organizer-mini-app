import { useMemo, useState } from 'react';
import {
  Button,
  Input,
  List,
  Placeholder,
  Section,
  SegmentedControl,
} from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
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
      <List className="fm-page-list">
        <ValueGroup header="Сводка">
          <ValueRow label="Всего продаж" value={String(paid.length)} muted />
          <ValueRow label="Возвраты" value={formatPrice(totalRefund)} muted />
          <ValueRow label="К выплате" value={formatPrice(payout)} muted />
        </ValueGroup>

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
          <Section>
            {filtered.map((s) => (
              <EntityListRow
                key={s.id}
                glyph={s.status === 'paid' ? '💳' : '↩️'}
                title={s.buyer || 'Покупатель'}
                subtitle={`${formatSaleDate(s.date)} · ${formatPrice(s.amount)} · ${
                  s.status === 'paid' ? 'Оплачено' : 'Возврат'
                }`}
                onClick={() => setSelectedId(s.id)}
              />
            ))}
          </Section>
        ) : (
          <Placeholder header="Продаж пока нет" description="Появятся после первых оплат" />
        )}
      </List>

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
