import { useState } from 'react';
import { Banner, Button, Input, List, Placeholder } from '@telegram-apps/telegram-ui';
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

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

export function KycPage({ snapshot, onSnapshotChange }) {
  const status = snapshot.profile?.kycStatus || (snapshot.profile?.verified ? 'approved' : 'idle');
  const copy = COPY[status] || COPY.idle;
  const [inn, setInn] = useState(snapshot.profile?.inn || '');
  const [ikpu, setIkpu] = useState(snapshot.profile?.ikpu || '');

  const submit = async () => {
    const innD = digits(inn);
    const ikpuD = digits(ikpu);
    if (innD && innD.length !== 9) {
      showError('ИНН — 9 цифр');
      return;
    }
    if (ikpuD && ikpuD.length !== 17) {
      showError('ИКПУ — 17 цифр');
      return;
    }
    try {
      const next = await runActionSafe('submit_kyc', { inn: innD, ikpu: ikpuD });
      onSnapshotChange(next);
    } catch (e) {
      showError(e.message || 'Не удалось отправить');
    }
  };

  const canEdit = status === 'idle' || status === 'rejected';

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
        {canEdit ? (
          <>
            <Input
              header="ИНН"
              inputMode="numeric"
              placeholder="9 цифр"
              value={inn}
              onChange={(e) => setInn(digits(e.target.value).slice(0, 9))}
            />
            <Input
              header="ИКПУ"
              inputMode="numeric"
              placeholder="17 цифр"
              value={ikpu}
              onChange={(e) => setIkpu(digits(e.target.value).slice(0, 17))}
            />
          </>
        ) : snapshot.profile?.inn || snapshot.profile?.ikpu ? (
          <Placeholder
            header={status === 'approved' ? 'Реквизиты сохранены' : 'На проверке'}
            description={[
              snapshot.profile?.inn ? `ИНН ${snapshot.profile.inn}` : null,
              snapshot.profile?.ikpu ? `ИКПУ ${snapshot.profile.ikpu}` : null,
            ].filter(Boolean).join(' · ')}
          />
        ) : null}
      </List>
    </SubpageLayout>
  );
}
