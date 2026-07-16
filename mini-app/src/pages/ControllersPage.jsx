import { useMemo, useState } from 'react';
import {
  Button,
  Cell,
  List,
  Navigation,
  Placeholder,
  Section,
} from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { AddControllerSheet } from '../components/AddControllerSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
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

/** Controllers — fields from admin ControllersTab */
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
      /* alerted */
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubpageLayout stickyCta>
      <PageHeader title="Контролеры" subtitle={`${list.length} из ${MAX}`} />
      <List className="fm-page-list">
        {list.length > 0 ? (
          <Section>
            {list.map((c) => (
              <Cell
                key={c.id}
                className="fm-tgui-entity-row"
                before={<span className="fm-entity-glyph" aria-hidden>📷</span>}
                subtitle={`${formatUzMobileMask(c.phoneNational || c.phone || '')} · ${c.scanCount ?? 0} сканов · ${formatLastLogin(c.lastLoginAt)}`}
                after={<Navigation />}
                onClick={() => {
                  haptic('selection');
                  setSelectedId(c.id);
                }}
              >
                {c.name || 'Контролер'}
              </Cell>
            ))}
          </Section>
        ) : (
          <Placeholder
            header="Контролеров пока нет"
            description="Добавляй по имени и телефону (+998) — до 5 человек"
          />
        )}
      </List>

      <StickyPageCta>
        <Button
          mode="filled"
          size="l"
          stretched
          disabled={list.length >= MAX}
          onClick={openAdd}
        >
          + Добавить
        </Button>
      </StickyPageCta>

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
          <List>
            <ValueGroup>
              <ValueRow label="Сканирований" value={String(selected.scanCount ?? 0)} muted />
              <ValueRow label="Добавлен" value={formatAdded(selected.addedAt)} muted />
              <ValueRow label="Последний вход" value={formatLastLogin(selected.lastLoginAt)} muted />
            </ValueGroup>
            <p className="fm-empty-hint">История сканирований — после первых QR на входе</p>
            <Button mode="outline" size="l" stretched disabled={busy} onClick={remove}>
              Удалить контролера
            </Button>
          </List>
        ) : null}
      </BottomSheet>
    </SubpageLayout>
  );
}
