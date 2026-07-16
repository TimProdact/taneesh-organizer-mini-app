import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Cell,
  Input,
  List,
  Navigation,
  Placeholder,
  Section,
} from '@telegram-apps/telegram-ui';
import { Icon20Copy } from '@telegram-apps/telegram-ui/dist/icons/20/copy';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { formatPrice } from '../utils.js';
import { copyText, haptic } from '../api.js';

function formatLastPurchase(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** CRM list — fields from admin PeopleView */
export function AudiencePage({ snapshot }) {
  const list = snapshot.audience || [];
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      [p.name, p.phone, p.email, p.contact]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [list, query]);

  const handleCopy = () => {
    haptic('light');
    copyText(
      list
        .map((p) => [p.name, p.phone, p.email].filter(Boolean).join('\t'))
        .filter(Boolean)
        .join('\n'),
    );
  };

  return (
    <SubpageLayout>
      <PageHeader title="Аудитория (CRM)" subtitle={`${list.length} клиентов`} />
      <List className="fm-page-list">
        <Input
          header="Поиск"
          placeholder="Имя, телефон, email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {filtered.length > 0 ? (
          <Section>
            {filtered.map((p) => (
              <Cell
                key={p.id}
                className="fm-tgui-entity-row"
                before={(
                  <Avatar
                    size={40}
                    acronym={(p.name || '?').slice(0, 2).toUpperCase()}
                  />
                )}
                subtitle={[
                  p.phone,
                  p.email,
                  `LTV ${formatPrice(p.ltv || 0)}`,
                  `${p.ticketsPurchased || 0} билетов`,
                  formatLastPurchase(p.lastPurchaseAt),
                ].filter(Boolean).join(' · ')}
                after={<Navigation />}
              >
                {p.name || 'Без имени'}
              </Cell>
            ))}
          </Section>
        ) : (
          <Placeholder
            header={list.length ? 'Никого не найдено' : 'Пока пусто'}
            description="Клиенты появятся после продаж и заявок на события"
          />
        )}

        {list.length > 0 ? (
          <div className="fm-page-cta fm-page-cta--separated">
            <Button mode="filled" size="l" stretched onClick={handleCopy}>
              <Icon20Copy />
              Скопировать все
            </Button>
          </div>
        ) : null}
      </List>
    </SubpageLayout>
  );
}
