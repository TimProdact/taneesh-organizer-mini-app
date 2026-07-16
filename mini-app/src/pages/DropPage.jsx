import { useMemo, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow, StepperRow, SwitchRow } from '../components/ValueRow.jsx';
import { formatDropDateOnly, formatDropTimeOnly, phaseLabel, vitrinaUrl } from '../utils.js';
import { haptic, runActionSafe } from '../api.js';

function toDateValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mergeDateTime(iso, datePart, timePart) {
  const base = iso ? new Date(iso) : new Date();
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  base.setFullYear(y, m - 1, d);
  base.setHours(hh, mm, 0, 0);
  return base.toISOString();
}

export function DropPage({ snapshot, onSnapshotChange, dropId }) {
  const drop = useMemo(() => {
    const list = snapshot.drops || [];
    return list.find((d) => d.id === dropId) || list[0] || snapshot;
  }, [snapshot, dropId]);

  const [sheet, setSheet] = useState(null);
  const [dateDraft, setDateDraft] = useState('');
  const [timeDraft, setTimeDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (adminAction, payload = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe(adminAction, { dropId: drop.id, ...payload });
      onSnapshotChange(next);
    } finally {
      setBusy(false);
    }
  };

  const openDate = () => {
    setDateDraft(toDateValue(drop.startsAt));
    setSheet('date');
  };

  const openTime = () => {
    setTimeDraft(toTimeValue(drop.startsAt));
    setSheet('time');
  };

  const saveDate = async () => {
    const time = toTimeValue(drop.startsAt) || '20:00';
    await act('set_starts_at', { startsAt: mergeDateTime(drop.startsAt, dateDraft, time) });
    setSheet(null);
  };

  const saveTime = async () => {
    const date = toDateValue(drop.startsAt) || toDateValue(new Date().toISOString());
    await act('set_starts_at', { startsAt: mergeDateTime(drop.startsAt, date, timeDraft) });
    setSheet(null);
  };

  const bumpStock = (delta) => {
    const next = Math.max(0, Math.min(drop.totalStock, drop.stock + delta));
    act('set_stock', { stock: next });
  };

  const openVitrina = () => {
    haptic('light');
    const tg = window.Telegram?.WebApp;
    const url = `${vitrinaUrl()}?drop=${drop.id}`;
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  };

  return (
    <SubpageLayout>
      <PageHeader title="Дроп" subtitle={drop.productName || drop.product?.name || 'Продажа'} />
      <div className="fm-page-body">
        <ValueGroup>
          <ValueRow label="Статус" value={phaseLabel(drop.phase, drop.paused)} muted />
          <ValueRow label="Дата старта" value={formatDropDateOnly(drop.startsAt)} onClick={openDate} />
          <ValueRow label="Время старта" value={formatDropTimeOnly(drop.startsAt)} onClick={openTime} />
          <StepperRow
            label="В наличии"
            value={`${drop.stock} шт`}
            decrementDisabled={busy || drop.stock <= 0}
            incrementDisabled={busy || drop.stock >= drop.totalStock}
            onDecrement={() => bumpStock(-1)}
            onIncrement={() => bumpStock(1)}
            last
          />
        </ValueGroup>

        <ValueGroup className="fm-value-group--spaced">
          <SwitchRow
            label="Активировать"
            checked={!drop.paused}
            onChange={(active) => act('set_paused', { paused: !active })}
          />
          <SwitchRow
            label="Скрыть"
            checked={drop.visible === false}
            onChange={(hidden) => act('set_drop_visible', { visible: !hidden })}
            last
          />
        </ValueGroup>

        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={openVitrina}>
            Посмотреть витрину
          </Button>
        </div>
      </div>

      <BottomSheet open={sheet === 'date'} title="Дата старта" onClose={() => setSheet(null)}>
        <div className="fm-field-sheet">
          <input type="date" className="fm-field-sheet-input fm-field-sheet-input--picker" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} />
          <Button mode="filled" size="l" stretched disabled={busy || !dateDraft} onClick={saveDate}>Готово</Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'time'} title="Время старта" onClose={() => setSheet(null)}>
        <div className="fm-field-sheet">
          <input type="time" className="fm-field-sheet-input fm-field-sheet-input--picker" value={timeDraft} onChange={(e) => setTimeDraft(e.target.value)} />
          <Button mode="filled" size="l" stretched disabled={busy || !timeDraft} onClick={saveTime}>Готово</Button>
        </div>
      </BottomSheet>
    </SubpageLayout>
  );
}
