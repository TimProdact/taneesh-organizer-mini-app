import { useMemo, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow, StepperRow, SwitchRow } from '../components/ValueRow.jsx';
import { formatEventDateOnly, formatEventTimeOnly, phaseLabel, publicPageUrl } from '../utils.js';
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

export function EventPage({ snapshot, onSnapshotChange, eventId }) {
  const event = useMemo(() => {
    const list = snapshot.events || [];
    return list.find((e) => e.id === eventId) || list[0] || {};
  }, [snapshot, eventId]);

  const [sheet, setSheet] = useState(null);
  const [dateDraft, setDateDraft] = useState('');
  const [timeDraft, setTimeDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (adminAction, payload = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe(adminAction, { eventId: event.id, ...payload });
      onSnapshotChange(next);
    } finally {
      setBusy(false);
    }
  };

  const left = event.ticketsLeft ?? 0;
  const total = event.ticketsTotal ?? 0;

  return (
    <SubpageLayout>
      <PageHeader title="Мероприятие" subtitle={event.name || 'Без названия'} />
      <div className="fm-page-body">
        <ValueGroup>
          <ValueRow label="Статус" value={phaseLabel(event.phase, event.paused)} muted />
          <ValueRow
            label="Дата"
            value={formatEventDateOnly(event.startsAt)}
            onClick={() => { setDateDraft(toDateValue(event.startsAt)); setSheet('date'); }}
          />
          <ValueRow
            label="Время"
            value={formatEventTimeOnly(event.startsAt)}
            onClick={() => { setTimeDraft(toTimeValue(event.startsAt)); setSheet('time'); }}
          />
          <StepperRow
            label="Билеты"
            value={`${left} / ${total}`}
            decrementDisabled={busy || left <= 0}
            incrementDisabled={busy || left >= total}
            onDecrement={() => act('set_tickets_left', { ticketsLeft: Math.max(0, left - 1) })}
            onIncrement={() => act('set_tickets_left', { ticketsLeft: Math.min(total, left + 1) })}
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
          <Button
            mode="filled"
            size="l"
            stretched
            onClick={() => {
              haptic('light');
              const tg = window.Telegram?.WebApp;
              const url = `${publicPageUrl()}?event=${event.id}`;
              if (tg?.openLink) tg.openLink(url);
              else window.open(url, '_blank', 'noopener');
            }}
          >
            Открыть страницу
          </Button>
        </div>
      </div>

      <BottomSheet open={sheet === 'date'} title="Дата" onClose={() => setSheet(null)}>
        <div className="fm-field-sheet">
          <input type="date" className="fm-field-sheet-input fm-field-sheet-input--picker" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} />
          <Button
            mode="filled"
            size="l"
            stretched
            disabled={busy || !dateDraft}
            onClick={async () => {
              const time = toTimeValue(event.startsAt) || '20:00';
              await act('set_starts_at', { startsAt: mergeDateTime(event.startsAt, dateDraft, time) });
              setSheet(null);
            }}
          >
            Готово
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'time'} title="Время" onClose={() => setSheet(null)}>
        <div className="fm-field-sheet">
          <input type="time" className="fm-field-sheet-input fm-field-sheet-input--picker" value={timeDraft} onChange={(e) => setTimeDraft(e.target.value)} />
          <Button
            mode="filled"
            size="l"
            stretched
            disabled={busy || !timeDraft}
            onClick={async () => {
              const date = toDateValue(event.startsAt) || toDateValue(new Date().toISOString());
              await act('set_starts_at', { startsAt: mergeDateTime(event.startsAt, date, timeDraft) });
              setSheet(null);
            }}
          >
            Готово
          </Button>
        </div>
      </BottomSheet>
    </SubpageLayout>
  );
}
