import { useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { LaunchDropSheet } from '../components/LaunchDropSheet.jsx';
import { formatDropDate, phaseLabel } from '../utils.js';
import { haptic } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

function listDrops(snapshot) {
  return snapshot.drops || [];
}

function dropSubtitle(drop) {
  const status = phaseLabel(drop.phase, drop.paused);
  const date = formatDropDate(drop.startsAt);
  const stock = drop.totalStock != null
    ? ` · ${drop.stock ?? 0} из ${drop.totalStock}`
    : '';
  return `${status} · ${date}${stock}`;
}

export function DropsListPage({ snapshot, onSnapshotChange, push }) {
  const drops = listDrops(snapshot);
  const [launchOpen, setLaunchOpen] = useState(false);

  const openLaunch = () => {
    haptic('selection');
    setLaunchOpen(true);
  };

  return (
    <SubpageLayout>
      <PageHeader title="Дропы" subtitle={`${drops.length} продаж`} />
      <div className="fm-page-body">
        {drops.length > 0 ? (
          <div className="fm-inset-card fm-entity-list">
            {drops.map((drop, index) => (
              <EntityListRow
                key={drop.id}
                glyph="⏱"
                title={drop.productName || drop.product?.name || 'Дроп'}
                subtitle={dropSubtitle(drop)}
                last={index === drops.length - 1}
                onClick={() => push(SCREENS.DROP, { dropId: drop.id })}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">Запусти первый дроп — выбери товар, дату и количество</p>
        )}

        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={openLaunch}>
            + Запустить дроп
          </Button>
        </div>
      </div>

      <LaunchDropSheet
        open={launchOpen}
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
        onClose={() => setLaunchOpen(false)}
        onGoCatalog={() => push(SCREENS.CATALOG)}
      />
    </SubpageLayout>
  );
}
