import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { Button } from '@telegram-apps/telegram-ui';
import { haptic, runActionSafe, showError } from '../api.js';

const COPY = {
  idle: {
    title: 'KYC не пройден',
    body: 'Подтвердите данные компании или самозанятого, чтобы создавать платные события и получать выплаты.',
    cta: 'Пройти верификацию',
  },
  pending: {
    title: 'KYC на проверке',
    body: 'Заявка у модератора. Обычно проверка занимает до 24 часов.',
    cta: null,
  },
  rejected: {
    title: 'KYC отклонён',
    body: 'Исправьте данные и отправьте заявку снова.',
    cta: 'Исправить',
  },
  approved: {
    title: 'KYC пройден',
    body: 'Аккаунт подтверждён. Доступны платные события и выплаты.',
    cta: null,
  },
};

export function KycPage({ snapshot, onSnapshotChange }) {
  const status = snapshot.profile?.kycStatus || (snapshot.profile?.verified ? 'approved' : 'idle');
  const copy = COPY[status] || COPY.idle;

  const submit = async () => {
    try {
      haptic('success');
      const next = await runActionSafe('submit_kyc', {});
      onSnapshotChange(next);
    } catch (e) {
      showError(e.message || 'Не удалось отправить');
    }
  };

  return (
    <SubpageLayout>
      <PageHeader title="Верификация" subtitle="KYC" />
      <div className="fm-page-body">
        <div className={`fm-kyc-card fm-kyc-card--${status}`}>
          <p className="fm-kyc-card-title">{copy.title}</p>
          <p className="fm-kyc-card-body">{copy.body}</p>
        </div>
        {copy.cta ? (
          <div className="fm-page-cta fm-page-cta--separated">
            <Button mode="filled" size="l" stretched onClick={submit}>
              {copy.cta}
            </Button>
          </div>
        ) : null}
        {status === 'idle' || status === 'rejected' ? (
          <p className="fm-empty-hint">
            Полная форма (ИП / ООО / самозанятый + документы) подключим к API Taneesh.
          </p>
        ) : null}
      </div>
    </SubpageLayout>
  );
}
