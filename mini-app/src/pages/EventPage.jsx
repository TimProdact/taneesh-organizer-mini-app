import { useMemo, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow, SwitchRow } from '../components/ValueRow.jsx';
import { MenuGroup, MenuRow } from '../components/MenuRow.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { DateTimePickerSheet, formatEventDateTime } from '../components/DateTimePickerSheet.jsx';
import { CreateEventSheet } from '../components/CreateEventSheet.jsx';
import {
  eventEntryChip,
  eventEntryLabel,
  eventMetricsRows,
  phaseLabel,
  publicPageUrl,
  formatPrice,
} from '../utils.js';
import { EVENT_INTERESTS } from '../config/eventInterests.js';
import { copyText, haptic, runActionSafe, showError } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

export function EventPage({ snapshot, onSnapshotChange, eventId, push, pop }) {
  const event = useMemo(() => {
    const list = snapshot.events || [];
    return list.find((e) => e.id === eventId) || list[0] || {};
  }, [snapshot, eventId]);

  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [field, setField] = useState(null); // name | description | locationName | locationAddress
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [draftInterests, setDraftInterests] = useState([]);

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

  const status = phaseLabel(event.phase, event.paused, event.visible, event.status);
  const cover = event.photos?.[0];
  const description = event.i18n?.description?.ru || '';
  const metrics = eventMetricsRows(event);
  const publicUrl = `${publicPageUrl()}?event=${event.id}`;
  const previewLabel = event.isFree === false ? 'Страница покупки' : 'Страница регистрации';
  const canDelete = !(
    (event.attendees || []).length
    || (event.sales || []).some((s) => s.status === 'paid')
    || (event.tickets || []).some((t) => (t.sold || 0) > 0)
  );

  const openPublic = () => {
    haptic('light');
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(publicUrl);
    else window.open(publicUrl, '_blank', 'noopener');
  };

  const removeEvent = async () => {
    setMenuOpen(false);
    if (!canDelete) {
      showError('Нельзя удалить мероприятие, на которое уже есть участники');
      return;
    }
    const tg = window.Telegram?.WebApp;
    const ok = tg?.showConfirm
      ? await new Promise((resolve) => {
          tg.showConfirm('Удалить событие безвозвратно?', resolve);
        })
      : window.confirm('Удалить событие безвозвратно?');
    if (!ok) return;
    try {
      const next = await runActionSafe('delete_event', { eventId: event.id });
      onSnapshotChange(next);
      if (typeof pop === 'function') pop();
      else push(SCREENS.EVENTS);
    } catch {
      /* alerted */
    }
  };

  return (
    <SubpageLayout>
      <PageHeader
        title={event.name || 'Мероприятие'}
        subtitle={status}
        trailing={(
          <button
            type="button"
            className="fm-page-more"
            aria-label="Ещё"
            onClick={() => { haptic('selection'); setMenuOpen(true); }}
          >
            ⋯
          </button>
        )}
      />

      <div className="fm-page-body">
        {cover ? (
          <div className="fm-event-hero">
            <img src={cover} alt="" className="fm-event-hero-img" />
            <span className="fm-event-hero-badge">{status}</span>
            <span className="fm-event-hero-chip">{eventEntryChip(event)}</span>
          </div>
        ) : (
          <div className="fm-event-hero fm-event-hero--empty">
            <span className="fm-event-hero-badge">{status}</span>
          </div>
        )}

        <ValueGroup className="fm-value-group--spaced">
          <ValueRow
            label="Название"
            value={event.name || '—'}
            onClick={() => setField('name')}
          />
          <ValueRow
            label="Описание"
            value={description ? (description.length > 42 ? `${description.slice(0, 42)}…` : description) : '—'}
            onClick={() => setField('description')}
          />
          <ValueRow
            label="Начало"
            value={formatEventDateTime(event.startsAt)}
            onClick={() => setPicker('start')}
          />
          <ValueRow
            label="Конец"
            value={formatEventDateTime(event.endsAt)}
            onClick={() => setPicker('end')}
          />
          <ValueRow
            label="Место"
            value={[event.location?.name, event.location?.address].filter(Boolean).join(' · ') || '—'}
            onClick={() => setField('location')}
          />
          <ValueRow
            label="Интересы"
            value={(event.interests || []).join(', ') || '—'}
            onClick={() => {
              setDraftInterests([...(event.interests || [])]);
              setInterestsOpen(true);
            }}
          />
          <ValueRow label="Вход" value={eventEntryLabel(event)} muted last />
        </ValueGroup>

        {!event.isFree && (event.tickets || []).length ? (
          <ValueGroup className="fm-value-group--spaced">
            {(event.tickets || []).map((t, i) => (
              <ValueRow
                key={t.id}
                label={t.name || `Билет ${i + 1}`}
                value={`${formatPrice(t.price)} · ${t.sold || 0}/${t.capacity}${
                  t.discountLabel ? ` · ${t.discountLabel}` : ''
                }`}
                muted
                last={i === event.tickets.length - 1}
              />
            ))}
          </ValueGroup>
        ) : null}

        <p className="fm-section-label">Метрики</p>
        <div className="fm-metrics-grid">
          {metrics.map((row) => (
            <div key={row.label} className="fm-metric-tile">
              <span className="fm-metric-value">{row.value}</span>
              <span className="fm-metric-label">{row.label}</span>
            </div>
          ))}
        </div>

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
            last={event.status !== 'draft'}
          />
          {event.status === 'draft' ? (
            <ValueRow
              label="Публикация"
              value="Опубликовать"
              onClick={() => act('publish_event')}
              last
            />
          ) : null}
        </ValueGroup>

        <MenuGroup>
          <MenuRow
            label="Участники"
            glyph="👥"
            tone="#af52de"
            value={String((event.attendees || []).length)}
            onClick={() => push(SCREENS.EVENT_ATTENDEES, { eventId: event.id })}
          />
          {event.isFree === false ? (
            <MenuRow
              label="Продажи"
              glyph="💳"
              tone="#34c759"
              value={String((event.sales || []).length)}
              onClick={() => push(SCREENS.EVENT_SALES, { eventId: event.id })}
            />
          ) : null}
          <MenuRow
            label="Поделиться"
            glyph="🔗"
            tone="#007aff"
            onClick={() => { haptic('selection'); setShareOpen(true); }}
            last
          />
        </MenuGroup>

        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={openPublic}>
            {previewLabel}
          </Button>
        </div>
      </div>

      <BottomSheet open={menuOpen} title="Действия" onClose={() => setMenuOpen(false)}>
        <div className="fm-action-list">
          <Button
            mode="outline"
            size="l"
            stretched
            onClick={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
          >
            Редактировать
          </Button>
          <Button
            mode="outline"
            size="l"
            stretched
            disabled={!canDelete}
            onClick={removeEvent}
          >
            Удалить
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={shareOpen} title="Поделиться" subtitle={event.name} onClose={() => setShareOpen(false)}>
        <div className="fm-share-sheet">
          <p className="fm-share-url">{publicUrl}</p>
          <Button mode="filled" size="l" stretched onClick={() => copyText(publicUrl)}>
            Скопировать ссылку
          </Button>
          <Button
            mode="outline"
            size="l"
            stretched
            onClick={() => {
              setShareOpen(false);
              push(SCREENS.ORG_QR);
            }}
          >
            QR-код страницы
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={interestsOpen}
        title="Интересы"
        onBack={() => setInterestsOpen(false)}
        onClose={() => setInterestsOpen(false)}
      >
        <div className="fm-chip-wrap">
          {EVENT_INTERESTS.map((item) => {
            const on = draftInterests.includes(item.label);
            return (
              <button
                key={item.id}
                type="button"
                className={`fm-chip${on ? ' fm-chip--on' : ''}`}
                onClick={() => {
                  haptic('selection');
                  setDraftInterests((prev) =>
                    on ? prev.filter((x) => x !== item.label) : [...prev, item.label],
                  );
                }}
              >
                {item.emoji} {item.label}
              </button>
            );
          })}
        </div>
        <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
          <Button
            mode="filled"
            size="l"
            stretched
            disabled={!draftInterests.length}
            onClick={async () => {
              await act('set_event_interests', { interests: draftInterests });
              setInterestsOpen(false);
            }}
          >
            Сохранить
          </Button>
        </div>
      </BottomSheet>

      <FieldSheet
        open={field === 'name'}
        title="Название"
        value={event.name || ''}
        placeholder="Название события"
        onClose={() => setField(null)}
        onSave={(v) => act('set_event_name', { name: v })}
      />
      <FieldSheet
        open={field === 'description'}
        title="Описание"
        value={description}
        multiline
        placeholder="Описание"
        onClose={() => setField(null)}
        onSave={(v) => act('set_event_description', { description: v })}
      />
      <FieldSheet
        open={field === 'location'}
        title="Место"
        value={[event.location?.name, event.location?.address].filter(Boolean).join('\n')}
        multiline
        placeholder={'Название места\nАдрес или ссылка'}
        onClose={() => setField(null)}
        onSave={(v) => {
          const [name, ...rest] = String(v).split('\n');
          return act('set_event_location', {
            location: { name: (name || '').trim(), address: rest.join('\n').trim() },
          });
        }}
      />

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
        valueIso={event.endsAt}
        busy={busy}
        onClose={() => setPicker(null)}
        onSave={async (iso) => {
          await act('set_ends_at', { endsAt: iso });
          setPicker(null);
        }}
      />

      <CreateEventSheet
        open={editOpen}
        snapshot={snapshot}
        event={event}
        onSnapshotChange={onSnapshotChange}
        onClose={() => setEditOpen(false)}
      />
    </SubpageLayout>
  );
}
