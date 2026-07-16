import { useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { LaunchDropSheet } from '../components/LaunchDropSheet.jsx';
import { formatDropDate, phaseLabel } from '../utils.js';
import { SCREENS } from '../navigation/screens.js';

function listEvents(snapshot) {
  return snapshot.events || snapshot.drops || [];
}

function eventSubtitle(event) {
  const status = phaseLabel(event.phase, event.paused);
  const date = formatDropDate(event.startsAt);
  const capacity = event.totalStock != null
    ? ` · ${event.stock ?? 0} из ${event.totalStock}`
    : '';
  return `${status} · ${date}${capacity}`;
}

export function DropsListPage({ snapshot, onSnapshotChange, push }) {
  const events = listEvents(snapshot);
  const [launchOpen, setLaunchOpen] = useState(false);

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
                title={event.name || event.productName || 'Мероприятие'}
                subtitle={eventSubtitle(event)}
                last={index === events.length - 1}
                onClick={() => push(SCREENS.DROP, { dropId: event.id })}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">Создай первое мероприятие — название, дата и число билетов</p>
        )}
        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={() => setLaunchOpen(true)}>
            + Создать мероприятие
          </Button>
        </div>
      </div>
      <LaunchDropSheet
        open={launchOpen}
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
        onClose={() => setLaunchOpen(false)}
      />
    </SubpageLayout>
  );
}
