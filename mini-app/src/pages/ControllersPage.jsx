import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { EntityListRow } from '../components/EntityListRow.jsx';

export function ControllersPage({ snapshot }) {
  const list = snapshot.controllers || [];

  return (
    <SubpageLayout>
      <PageHeader title="Контролеры" subtitle={`${list.length} из 5`} />
      <div className="fm-page-body">
        {list.length > 0 ? (
          <div className="fm-inset-card fm-entity-list">
            {list.map((c, index) => (
              <EntityListRow
                key={c.id}
                glyph="📷"
                title={c.name || c.phone}
                subtitle={c.phone || ''}
                last={index === list.length - 1}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">Добавляй контролеров по имени и телефону — до 5 человек</p>
        )}
      </div>
    </SubpageLayout>
  );
}
