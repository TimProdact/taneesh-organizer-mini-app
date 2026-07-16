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
  const event = useMemo(() => {
    const list = snapshot.events || snapshot.drops || [];
    return list.find((d) => d.id === dropId) || list[0] || {};
  }, [snapshot, dropId]);

  const [sheet, setSheet] = useState(null);
  const [dateDraft, setDateDraft] = useState('');
  const [timeDraft, setTimeDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (adminAction, payload = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe(adminAction, { dropId: event.id, eventId: event.id, ...payload });
      onSnapshotChange(next);
    } finally {
      setBusy(false);
    }
  };

  const openDate = () => {
    setDateDraft(toDateValue(event.startsAt));
    setSheet('date');
  };

  const openTime = () => {
    setTimeDraft(toTimeValue(event.startsAt));
    setSheet('time');
  };

  const saveDate = async () => {
    const time = toTimeValue(event.startsAt) || '20:00';
    await act('set_starts_at', { startsAt: mergeDateTime(event.startsAt, dateDraft, time) });
    setSheet(null);
  };

  const saveTime = async () => {
    const date = toDateValue(event.startsAt) || toDateValue(new Date().toISOString());
    await act('set_starts_at', { startsAt: mergeDateTime(event.startsAt, date, timeDraft) });
    setSheet(null);
  };

  const bumpStock = (delta) => {
    const next = Math.max(0, Math.min(event.totalStock, (event.stock ?? 0) + delta));
    act('set_stock', { stock: next });
  };

  const openPage = () => {
    haptic('light');
    const tg = window.Telegram?.WebApp;
    const url = `${vitrinaUrl()}?event=${event.id}`;
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  };

  return (
    <SubpageLayout>
      <PageHeader title="Мероприятие" subtitle={event.name || 'Без названия'} />
      <div className="fm-page-body">
        <ValueGroup>
          <ValueRow label="Статус" value={phaseLabel(event.phase, event.paused)} muted />
          <ValueRow label="Дата" value={formatDropDateOnly(event.startsAt)} onClick={openDate} />
          <ValueRow label="Время" value={formatDropTimeOnly(event.startsAt)} onClick={openTime} />
          <StepperRow
            label="Билеты"
            value={`${event.stock ?? 0} / ${event.totalStock ?? 0}`}
            decrementDisabled={busy || (event.stock ?? 0) <= 0}
            incrementDisabled={busy || (event.stock ?? 0) >= (event.totalStock ?? 0)}
            onDecrement={() => bumpStock(-1)}
            onIncrement={() => bumpStock(1)}
            last
          />
        </ValueGroup>

        <ValueGroup className="fm-value-group--spaced">
          <SwitchRow
            label="Активировать"
            checked={!event.paused}
            onChange={(active) => act('set_paused', { paused: !active })}
          />
          <SwitchRow
            label="Скрыть"
            checked={event.visible === false}
            onChange={(hidden) => act('set_event_visible', { visible: !hidden })}
            last
          />
        </ValueGroup>

        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={openPage}>
            Открыть страницу
          </Button>
        </div>
      </div>

      <BottomSheet open={sheet === 'date'} title="Дата" onClose={() => setSheet(null)}>
        <div className="fm-field-sheet">
          <input type="date" className="fm-field-sheet-input fm-field-sheet-input--picker" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} />
          <Button mode="filled" size="l" stretched disabled={busy || !dateDraft} onClick={saveDate}>Готово</Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'time'} title="Время" onClose={() => setSheet(null)}>
        <div className="fm-field-sheet">
          <input type="time" className="fm-field-sheet-input fm-field-sheet-input--picker" value={timeDraft} onChange={(e) => setTimeDraft(e.target.value)} />
          <Button mode="filled" size="l" stretched disabled={busy || !timeDraft} onClick={saveTime}>Готово</Button>
        </div>
      </BottomSheet>
    </SubpageLayout>
  );
}
