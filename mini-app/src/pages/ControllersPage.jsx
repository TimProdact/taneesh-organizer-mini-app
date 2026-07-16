import { useMemo, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { AddControllerSheet } from '../components/AddControllerSheet.jsx';
import { formatUzMobileMask } from '../utils/uzPhoneMask.js';
import { haptic, runActionSafe, showError } from '../api.js';

const MAX = 5;

function formatAdded(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatLastLogin(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate()
    && d.getMonth() === now.getMonth()
    && d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Сегодня, ${time}`;
  return `${formatAdded(iso)}, ${time}`;
}

function controllerSubtitle(c) {
  const phone = formatUzMobileMask(c.phoneNational || c.phone || '');
  const scans = c.scanCount != null ? ` · ${c.scanCount} скан.` : '';
  return `${phone}${scans}`;
}

export function ControllersPage({ snapshot, onSnapshotChange }) {
  const list = snapshot.controllers || [];
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => list.find((c) => String(c.id) === String(selectedId)) || null,
    [list, selectedId],
  );

  const openAdd = () => {
    if (list.length >= MAX) {
      showError(`Максимальное количество контролеров: ${MAX}`);
      return;
    }
    haptic('selection');
    setAddOpen(true);
  };

  const remove = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('remove_controller', { controllerId: selected.id });
      onSnapshotChange(next);
      setSelectedId(null);
    } catch {
      /* alert already shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubpageLayout>
      <PageHeader title="Контролеры" subtitle={`${list.length} из ${MAX}`} />
      <div className="fm-page-body">
        {list.length > 0 ? (
          <div className="fm-inset-card fm-entity-list">
            {list.map((c, index) => (
              <EntityListRow
                key={c.id}
                glyph="📷"
                title={c.name || 'Контролер'}
                subtitle={controllerSubtitle(c)}
                last={index === list.length - 1}
                onClick={() => {
                  haptic('selection');
                  setSelectedId(c.id);
                }}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">Добавляй контролеров по имени и телефону — до {MAX} человек</p>
        )}

        <div className="fm-page-cta fm-page-cta--separated">
          <Button
            mode="filled"
            size="l"
            stretched
            disabled={list.length >= MAX}
            onClick={openAdd}
          >
            + Добавить
          </Button>
        </div>
      </div>

      <AddControllerSheet
        open={addOpen}
        onSnapshotChange={onSnapshotChange}
        onClose={() => setAddOpen(false)}
      />

      <BottomSheet
        open={Boolean(selected)}
        title={selected?.name || 'Контролер'}
        subtitle={selected ? formatUzMobileMask(selected.phoneNational || selected.phone || '') : ''}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <div className="fm-controller-detail">
            <div className="fm-controller-stats">
              <div className="fm-controller-stat">
                <span className="fm-controller-stat-label">Сканирований</span>
                <span className="fm-controller-stat-value">{selected.scanCount ?? 0}</span>
              </div>
              <div className="fm-controller-stat">
                <span className="fm-controller-stat-label">Добавлен</span>
                <span className="fm-controller-stat-value">{formatAdded(selected.addedAt)}</span>
              </div>
              <div className="fm-controller-stat">
                <span className="fm-controller-stat-label">Последний вход</span>
                <span className="fm-controller-stat-value">{formatLastLogin(selected.lastLoginAt)}</span>
              </div>
            </div>
            <p className="fm-empty-hint">История сканирований появится после первых QR на входе</p>
            <Button mode="outline" size="l" stretched disabled={busy} onClick={remove}>
              Удалить контролера
            </Button>
          </div>
        ) : null}
      </BottomSheet>
    </SubpageLayout>
  );
}
