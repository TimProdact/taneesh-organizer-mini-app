import { Button } from '@telegram-apps/telegram-ui';
import { Icon20Copy } from '@telegram-apps/telegram-ui/dist/icons/20/copy';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { copyText, haptic } from '../api.js';

export function WaitlistPage({ snapshot }) {
  const list = snapshot.audience || snapshot.waitlist || [];

  const handleCopy = () => {
    haptic('light');
    copyText(list.map((w) => w.contact || w.phone || w.name || '').filter(Boolean).join('\n'));
  };

  return (
    <SubpageLayout>
      <PageHeader title="Аудитория" subtitle={`${list.length} контактов`} />
      <div className="fm-page-body">
        {list.length > 0 ? (
          <div className="fm-inset-card fm-waitlist-card">
            <ul className="fm-waitlist-list">
              {list.map((w) => (
                <li key={w.id}>{w.contact || w.name || w.phone}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="fm-empty-hint">Пока нет зрителей в CRM — появятся после продаж и заявок</p>
        )}

        {list.length > 0 ? (
          <div className="fm-page-cta fm-page-cta--separated">
            <Button mode="filled" size="l" stretched onClick={handleCopy}>
              <Icon20Copy />
              Скопировать все
            </Button>
          </div>
        ) : null}
      </div>
    </SubpageLayout>
  );
}
