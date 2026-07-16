import { Banner, Button, List, Placeholder } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { runActionSafe, showError } from '../api.js';

/** Copy from admin LegalRequisitesPanel */
const COPY = {
  idle: {
    header: 'Требуется верификация',
    description:
      'Для создания платных событий и получения выплат необходимо подтвердить личность или данные компании.',
    cta: 'Пройти верификацию',
  },
  pending: {
    header: 'На проверке',
    description: 'Ваши данные находятся на проверке у администратора. Обычно это занимает до 24 часов.',
    cta: null,
  },
  rejected: {
    header: 'Верификация отклонена',
    description: 'Исправьте ошибки и отправьте заявку повторно.',
    cta: 'Исправить',
  },
  approved: {
    header: 'Верификация пройдена',
    description: 'Аккаунт подтверждён. Можно создавать платные события и выводить средства.',
    cta: null,
  },
};

export function KycPage({ snapshot, onSnapshotChange }) {
  const status = snapshot.profile?.kycStatus || (snapshot.profile?.verified ? 'approved' : 'idle');
  const copy = COPY[status] || COPY.idle;

  const submit = async () => {
    try {
      const next = await runActionSafe('submit_kyc', {});
      onSnapshotChange(next);
    } catch (e) {
      showError(e.message || 'Не удалось отправить');
    }
  };

  return (
    <SubpageLayout>
      <PageHeader title="Реквизиты" subtitle="Верификация KYC" />
      <List className="fm-page-list">
        <Banner type="section" header={copy.header} description={copy.description}>
          {copy.cta ? (
            <Button size="s" mode="filled" onClick={submit}>
              {copy.cta}
            </Button>
          ) : null}
        </Banner>
        {status === 'idle' || status === 'rejected' ? (
          <Placeholder
            header="Форма ИП / ООО / самозанятый"
            description="Полная анкета и загрузка документов — как в веб-админке; подключим к API Taneesh."
          />
        ) : null}
      </List>
    </SubpageLayout>
  );
}
