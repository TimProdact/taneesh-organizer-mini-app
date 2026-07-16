import { Cell, List, Navigation, Section } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { haptic } from '../api.js';

/** Legal documents — admin LegalDocumentsPanel labels */
const DOCS = [
  {
    id: 'offer',
    title: 'Оферта для организаторов',
    subtitle: 'Условия размещения мероприятий',
    url: 'https://taneesh.org/legal/offer',
  },
  {
    id: 'privacy',
    title: 'Политика обработки ПДн',
    subtitle: 'Персональные данные участников',
    url: 'https://taneesh.org/legal/privacy',
  },
  {
    id: 'payout',
    title: 'Правила выплат',
    subtitle: 'Hold, комиссия, сроки',
    url: 'https://taneesh.org/legal/payouts',
  },
];

export function DocumentsPage() {
  const open = (url) => {
    haptic('light');
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  };

  return (
    <SubpageLayout>
      <PageHeader title="Документы" subtitle="Юридические материалы" />
      <List className="fm-page-list">
        <Section header="Документы">
          {DOCS.map((doc) => (
            <Cell
              key={doc.id}
              before={<span className="fm-entity-glyph" aria-hidden>📄</span>}
              subtitle={doc.subtitle}
              after={<Navigation />}
              onClick={() => open(doc.url)}
            >
              {doc.title}
            </Cell>
          ))}
        </Section>
      </List>
    </SubpageLayout>
  );
}
