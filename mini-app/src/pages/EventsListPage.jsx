import { useMemo, useState } from 'react';
import { Button, List, Placeholder, Section, SegmentedControl, Cell, Navigation } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { CreateEventSheet } from '../components/CreateEventSheet.jsx';
import { eventEntryLabel, formatEventDate, phaseLabel } from '../utils.js';
import { haptic } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

/** Filters mirror admin EventList: upcoming | past | drafts | archive */
function matchesFilter(event, filter) {
  const now = Date.now();
  const start = event.startsAt ? new Date(event.startsAt).getTime() : now;
  const isPast = start < now;
  const status = event.status || 'published';
  const phase = event.phase;

  if (filter === 'upcoming') {
    return !isPast && status !== 'draft' && phase !== 'draft' && event.visible !== false;
  }
  if (filter === 'past') {
    return isPast && status !== 'draft';
  }
  if (filter === 'drafts') {
    return status === 'draft' || phase === 'draft';
  }
  if (filter === 'archive') {
    return event.visible === false || phase === 'sold_out';
  }
  return true;
}

function eventSubtitle(event) {
  const status = phaseLabel(event.phase, event.paused, event.visible, event.status);
  const date = formatEventDate(event.startsAt);
  const entry = eventEntryLabel(event);
  const place = event.location?.name ? ` · ${event.location.name}` : '';
  return `${status} · ${date}${place} · ${entry}`;
}

export function EventsListPage({ snapshot, onSnapshotChange, push }) {
  const events = snapshot.events || [];
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState('upcoming');

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, filter)),
    [events, filter],
  );

  return (
    <SubpageLayout>
      <PageHeader title="Мероприятия" subtitle={`${events.length} всего`} />
      <List className="fm-page-list">
        <div className="fm-segment-wrap fm-segment-wrap--media">
          <SegmentedControl>
            {[
              { id: 'upcoming', label: 'Скоро' },
              { id: 'past', label: 'Прошедшие' },
              { id: 'drafts', label: 'Черновики' },
              { id: 'archive', label: 'Архив' },
            ].map((f) => (
              <SegmentedControl.Item
                key={f.id}
                selected={filter === f.id}
                onClick={() => {
                  haptic('selection');
                  setFilter(f.id);
                }}
              >
                {f.label}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        </div>

        {filtered.length > 0 ? (
          <Section>
            {filtered.map((event) => (
              <Cell
                key={event.id}
                className="fm-entity-row"
                before={
                  event.photos?.[0] ? (
                    <img src={event.photos[0]} alt="" className="fm-event-thumb" />
                  ) : (
                    <span className="fm-entity-glyph" aria-hidden>📅</span>
                  )
                }
                subtitle={eventSubtitle(event)}
                after={<Navigation />}
                onClick={() => {
                  haptic('selection');
                  push(SCREENS.EVENT, { eventId: event.id });
                }}
              >
                {event.name || 'Мероприятие'}
              </Cell>
            ))}
          </Section>
        ) : (
          <Placeholder
            header="Нет мероприятий"
            description={
              filter === 'drafts'
                ? 'Черновиков пока нет'
                : 'Создай первое — обложка, описание, место и билеты'
            }
          />
        )}

        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={() => setCreateOpen(true)}>
            + Создать мероприятие
          </Button>
        </div>
      </List>
      <CreateEventSheet
        open={createOpen}
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
        onClose={() => setCreateOpen(false)}
      />
    </SubpageLayout>
  );
}
