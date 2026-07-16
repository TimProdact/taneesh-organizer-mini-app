import { useMemo, useState } from 'react';
import {
  Button,
  Input,
  List,
  Placeholder,
  Section,
  SegmentedControl,
} from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { haptic, runActionSafe, showError } from '../api.js';
import { formatUzMobileMask, isCompleteUzMobile, parseUzMobileDigits } from '../utils/uzPhoneMask.js';

function typeLabel(event, type) {
  if (event.isFree) {
    const map = {
      pending: 'Ждут',
      approved: 'Подтверждённые',
      invited: 'Приглашённые',
      declined: 'Отклонённые',
    };
    return map[type] || type || '—';
  }
  return type || '—';
}

function checkLabel(checkIn) {
  return checkIn === 'entered' ? 'Прошёл' : 'Не прошёл';
}

export function EventAttendeesPage({ snapshot, onSnapshotChange, eventId }) {
  const event = useMemo(() => {
    const list = snapshot.events || [];
    return list.find((e) => e.id === eventId) || {};
  }, [snapshot, eventId]);

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('phone');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);

  const list = event.attendees || [];
  const selected = list.find((a) => a.id === selectedId) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((a) => {
      if (filter === 'entered' && a.checkIn !== 'entered') return false;
      if (filter === 'waiting' && a.checkIn === 'entered') return false;
      if (filter !== 'all' && filter !== 'entered' && filter !== 'waiting' && a.type !== filter) {
        return false;
      }
      if (!q) return true;
      return (
        String(a.name || '').toLowerCase().includes(q)
        || String(a.contact || '').toLowerCase().includes(q)
      );
    });
  }, [list, filter, query]);

  const invite = async () => {
    if (!name.trim()) {
      showError('Укажите имя');
      return;
    }
    let contactValue = contact.trim();
    if (channel === 'phone') {
      if (!isCompleteUzMobile(contact)) {
        showError('Укажите телефон +998');
        return;
      }
      contactValue = formatUzMobileMask(contact);
    } else if (!contactValue.includes('@')) {
      showError('Укажите email');
      return;
    }
    setBusy(true);
    try {
      const next = await runActionSafe('invite_attendee', {
        eventId: event.id,
        name: name.trim(),
        contact: contactValue,
        channel,
      });
      onSnapshotChange(next);
      setInviteOpen(false);
      setName('');
      setContact('');
    } catch {
      /* alerted */
    } finally {
      setBusy(false);
    }
  };

  const doAction = async (action) => {
    if (!selected) return;
    setBusy(true);
    try {
      const next = await runActionSafe('attendee_action', {
        eventId: event.id,
        attendeeId: selected.id,
        action,
      });
      onSnapshotChange(next);
      setSelectedId(null);
    } catch {
      /* alerted */
    } finally {
      setBusy(false);
    }
  };

  const filters = event.isFree
    ? [
        { id: 'all', label: 'Все' },
        { id: 'pending', label: 'Ждут' },
        { id: 'approved', label: 'Ок' },
        { id: 'invited', label: 'Инвайт' },
      ]
    : [
        { id: 'all', label: 'Все' },
        { id: 'waiting', label: 'Не прошли' },
        { id: 'entered', label: 'Прошли' },
      ];

  return (
    <SubpageLayout stickyCta>
      <PageHeader
        title="Участники"
        subtitle={`${filtered.length} из ${list.length} · ${event.name || ''}`}
      />
      <List className="fm-page-list">
        <Input
          header="Поиск"
          placeholder="Имя или контакт"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="fm-segment-wrap fm-segment-wrap--media">
          <SegmentedControl>
            {filters.map((f) => (
              <SegmentedControl.Item
                key={f.id}
                selected={filter === f.id}
                onClick={() => { setFilter(f.id); haptic('selection'); }}
              >
                {f.label}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        </div>

        {filtered.length ? (
          <Section>
            {filtered.map((a) => (
              <EntityListRow
                key={a.id}
                glyph={a.checkIn === 'entered' ? '✅' : '👤'}
                title={a.name}
                subtitle={`${typeLabel(event, a.type)} · ${a.contact} · ${checkLabel(a.checkIn)}`}
                onClick={() => setSelectedId(a.id)}
              />
            ))}
          </Section>
        ) : (
          <Placeholder
            header="Никого нет"
            description="Пока нет участников по этому фильтру"
          />
        )}
      </List>

      <StickyPageCta>
        <Button
          mode="filled"
          size="l"
          stretched
          onClick={() => {
            haptic('selection');
            setInviteOpen(true);
          }}
        >
          Пригласить
        </Button>
      </StickyPageCta>

      <BottomSheet
        open={inviteOpen}
        title="Пригласить участника"
        onBack={() => setInviteOpen(false)}
        onClose={() => setInviteOpen(false)}
      >
        <div className="fm-controller-form">
          <Input
            header="Имя"
            placeholder="Имя участника"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="fm-segment-wrap">
            <SegmentedControl>
              <SegmentedControl.Item
                selected={channel === 'phone'}
                onClick={() => { setChannel('phone'); setContact(''); }}
              >
                Телефон
              </SegmentedControl.Item>
              <SegmentedControl.Item
                selected={channel === 'email'}
                onClick={() => { setChannel('email'); setContact(''); }}
              >
                Email
              </SegmentedControl.Item>
            </SegmentedControl>
          </div>
          <Input
            header={channel === 'phone' ? 'Телефон' : 'Email'}
            type={channel === 'phone' ? 'tel' : 'email'}
            inputMode={channel === 'phone' ? 'numeric' : 'email'}
            placeholder={channel === 'phone' ? '+998 __ ___ __ __' : 'email@example.com'}
            value={channel === 'phone' ? formatUzMobileMask(contact) : contact}
            onChange={(e) => {
              if (channel === 'phone') setContact(parseUzMobileDigits(e.target.value));
              else setContact(e.target.value);
            }}
          />
          <Button mode="filled" size="l" stretched disabled={busy} onClick={invite}>
            Отправить приглашение
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={Boolean(selected)}
        title={selected?.name || 'Участник'}
        subtitle={selected ? `${typeLabel(event, selected.type)} · ${selected.contact}` : ''}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <div className="fm-action-list">
            {event.isFree && selected.type === 'pending' ? (
              <>
                <Button mode="filled" size="l" stretched disabled={busy} onClick={() => doAction('approve')}>
                  Одобрить
                </Button>
                <Button mode="outline" size="l" stretched disabled={busy} onClick={() => doAction('decline')}>
                  Отклонить
                </Button>
              </>
            ) : null}
            {selected.checkIn !== 'entered'
              && (selected.type === 'approved' || (!event.isFree && selected.type !== 'invited' && selected.type !== 'Invited') || selected.type === 'Invited' || selected.type === 'invited')
              ? (
                <Button mode="filled" size="l" stretched disabled={busy} onClick={() => doAction('check_in')}>
                  Отметить проход
                </Button>
              ) : null}
            {(selected.type === 'invited' || selected.type === 'Invited') ? (
              <Button mode="outline" size="l" stretched disabled={busy} onClick={() => doAction('cancel_invite')}>
                Отменить приглашение
              </Button>
            ) : null}
            {event.isFree && selected.type === 'approved' && selected.checkIn !== 'entered' ? (
              <Button mode="outline" size="l" stretched disabled={busy} onClick={() => doAction('cancel_approval')}>
                Отменить подтверждение
              </Button>
            ) : null}
            {selected.checkIn === 'entered' ? (
              <p className="fm-empty-hint">Участник уже прошёл — действия недоступны</p>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>
    </SubpageLayout>
  );
}
