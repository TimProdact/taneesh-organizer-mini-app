import { useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { CreateEventSheet } from '../components/CreateEventSheet.jsx';
import { formatEventDate, phaseLabel } from '../utils.js';
import { SCREENS } from '../navigation/screens.js';

function eventSubtitle(event) {
  const status = phaseLabel(event.phase, event.paused);
  const date = formatEventDate(event.startsAt);
  const tickets = event.ticketsTotal != null
    ? ` · ${event.ticketsLeft ?? 0} из ${event.ticketsTotal}`
    : '';
  return `${status} · ${date}${tickets}`;
}

export function EventsListPage({ snapshot, onSnapshotChange, push }) {
  const events = snapshot.events || [];
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <SubpageLayout>
      <PageHeader title="Мероприятия" subtitle={`${events.length} всего`} />
      <div className="fm-page-body">
        {events.length > 0 ? (
          <div className="fm-inset-card fm-entity-list">
            {events.map((event, index) => (
              <EntityListRow
                key={event.id}
                glyph="📅"
                title={event.name || 'Мероприятие'}
                subtitle={eventSubtitle(event)}
                last={index === events.length - 1}
                onClick={() => push(SCREENS.EVENT, { eventId: event.id })}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">Создай первое мероприятие — обложка, описание, место и билеты</p>
        )}
        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={() => setCreateOpen(true)}>
            + Создать мероприятие
          </Button>
        </div>
      </div>
      <CreateEventSheet
        open={createOpen}
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
        onClose={() => setCreateOpen(false)}
      />
    </SubpageLayout>
  );
}
