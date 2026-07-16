import { useMemo, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow, StepperRow, SwitchRow } from '../components/ValueRow.jsx';
import { DateTimePickerSheet, formatEventDateTime } from '../components/DateTimePickerSheet.jsx';
import { phaseLabel, publicPageUrl } from '../utils.js';
import { haptic, runActionSafe } from '../api.js';

export function EventPage({ snapshot, onSnapshotChange, eventId }) {
  const event = useMemo(() => {
    const list = snapshot.events || [];
    return list.find((e) => e.id === eventId) || list[0] || {};
  }, [snapshot, eventId]);

  const [picker, setPicker] = useState(null); // 'start' | 'end' | null
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

  const defaultEnd = () => {
    if (event.endsAt) return event.endsAt;
    if (!event.startsAt) return new Date(Date.now() + 3 * 3600_000).toISOString();
    return new Date(new Date(event.startsAt).getTime() + 3 * 3600_000).toISOString();
  };

  return (
    <SubpageLayout>
      <PageHeader title="Мероприятие" subtitle={event.name || 'Без названия'} />
      <div className="fm-page-body">
        <ValueGroup>
          <ValueRow label="Статус" value={phaseLabel(event.phase, event.paused)} muted />
          {event.location?.name ? (
            <ValueRow
              label="Место"
              value={[event.location.name, event.location.address].filter(Boolean).join(' · ')}
              muted
            />
          ) : null}
          {event.interests?.length ? (
            <ValueRow label="Интересы" value={event.interests.join(', ')} muted />
          ) : null}
          <ValueRow
            label="Вход"
            value={
              event.isFree === false
                ? `Платно · ${(event.tickets || []).length} тип(а)`
                : event.freeEntryMode === 'open'
                  ? 'Бесплатно · свободный'
                  : 'Бесплатно · модерация'
            }
            muted
          />
          <ValueRow
            label="Начало"
            value={formatEventDateTime(event.startsAt)}
            onClick={() => setPicker('start')}
          />
          <ValueRow
            label="Конец"
            value={formatEventDateTime(event.endsAt || defaultEnd())}
            onClick={() => setPicker('end')}
            last={event.ticketsTotal == null}
          />
          {event.ticketsTotal != null ? (
            <StepperRow
              label="Билеты"
              value={`${left} / ${total}`}
              decrementDisabled={busy || left <= 0}
              incrementDisabled={busy || left >= total}
              onDecrement={() => act('set_tickets_left', { ticketsLeft: Math.max(0, left - 1) })}
              onIncrement={() => act('set_tickets_left', { ticketsLeft: Math.min(total, left + 1) })}
              last
            />
          ) : null}
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

      <DateTimePickerSheet
        open={picker === 'start'}
        title="Начало"
        valueIso={event.startsAt}
        busy={busy}
        onClose={() => setPicker(null)}
        onSave={async (iso) => {
          await act('set_starts_at', { startsAt: iso });
          setPicker(null);
        }}
      />

      <DateTimePickerSheet
        open={picker === 'end'}
        title="Конец"
        valueIso={event.endsAt || defaultEnd()}
        busy={busy}
        onClose={() => setPicker(null)}
        onSave={async (iso) => {
          await act('set_ends_at', { endsAt: iso });
          setPicker(null);
        }}
      />
    </SubpageLayout>
  );
}
