import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';
import { haptic } from '../api.js';

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
      <div className="fm-page-body">
        <div className="fm-inset-card fm-entity-list">
          {DOCS.map((doc, index) => (
            <EntityListRow
              key={doc.id}
              glyph="📄"
              title={doc.title}
              subtitle={doc.subtitle}
              last={index === DOCS.length - 1}
              onClick={() => open(doc.url)}
            />
          ))}
        </div>
      </div>
    </SubpageLayout>
  );
}
