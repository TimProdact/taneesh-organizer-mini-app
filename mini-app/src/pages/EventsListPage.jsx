import { useMemo, useState } from 'react';
import { Button, List, Placeholder, Section, SegmentedControl, Cell, Navigation } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { CreateEventSheet } from '../components/CreateEventSheet.jsx';
import { eventEntryLabel, formatEventDate, phaseLabel } from '../utils.js';
import { haptic } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

const ARCHIVE_STATUSES = new Set(['cancelled', 'rejected', 'archived', 'hidden', 'deleted']);

/** Active vs Archive — archive = прошедшие, отменённые, черновики */
function isArchivedEvent(event) {
  const now = Date.now();
  const start = event.startsAt ? new Date(event.startsAt).getTime() : now;
  const isPast = start < now;
  const status = event.status || 'published';
  const phase = event.phase;

  if (status === 'draft' || phase === 'draft') return true;
  if (ARCHIVE_STATUSES.has(status)) return true;
  if (event.visible === false) return true;
  if (isPast) return true;
  return false;
}

function matchesFilter(event, filter) {
  const archived = isArchivedEvent(event);
  if (filter === 'archive') return archived;
  return !archived;
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
  const [filter, setFilter] = useState('active');

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, filter)),
    [events, filter],
  );

  const activeCount = useMemo(
    () => events.filter((e) => !isArchivedEvent(e)).length,
    [events],
  );

  return (
    <SubpageLayout stickyCta>
      <PageHeader
        title="Мероприятия"
        subtitle={filter === 'archive' ? `${filtered.length} в архиве` : `${activeCount} активных`}
      />
      <List className="fm-page-list">
        <div className="fm-segment-wrap fm-segment-wrap--media">
          <SegmentedControl>
            {[
              { id: 'active', label: 'Активные' },
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
          <Section header={filter === 'archive' ? 'Архив' : 'Активные'}>
            {filtered.map((event) => (
              <Cell
                key={event.id}
                className="fm-tgui-entity-row"
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
            header={filter === 'archive' ? 'Архив пуст' : 'Нет активных'}
            description={
              filter === 'archive'
                ? 'Сюда попадают прошедшие, отменённые и черновики'
                : 'Создай первое — фото, описание, место и билеты'
            }
          />
        )}
      </List>

      <StickyPageCta>
        <Button mode="filled" size="l" stretched onClick={() => setCreateOpen(true)}>
          + Создать мероприятие
        </Button>
      </StickyPageCta>

      <CreateEventSheet
        open={createOpen}
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
        onClose={() => setCreateOpen(false)}
      />
    </SubpageLayout>
  );
}
