import { Banner, Button, List, Placeholder } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
import { formatPrice } from '../utils.js';
import { haptic } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

/**
 * Finance — admin LegalTab «Выплаты».
 * Без approved KYC выплаты недоступны (как в админке).
 */
export function FinancePage({ snapshot, push }) {
  const finance = snapshot.finance || {};
  const hold = finance.hold ?? 0;
  const paid = finance.totalPaid ?? 0;
  const history = finance.history || [];
  const kyc =
    snapshot.profile?.kycStatus
    || (snapshot.profile?.verified ? 'approved' : 'idle');
  const verified = kyc === 'approved';

  return (
    <SubpageLayout>
      <PageHeader title="Финансы" subtitle="Выплаты и реквизиты" />
      <List className="fm-page-list">
        {!verified ? (
          <Banner
            type="section"
            header="Нужна верификация"
            description="Для просмотра выплат необходимо пройти верификацию во вкладке «Реквизиты»."
          >
            <Button
              size="s"
              mode="filled"
              onClick={() => {
                haptic('selection');
                push?.(SCREENS.KYC);
              }}
            >
              Реквизиты
            </Button>
          </Banner>
        ) : null}

        <ValueGroup header="Сводка">
          <ValueRow label="В ожидании (Hold)" value={formatPrice(hold)} muted />
          <ValueRow label="Всего выплачено" value={formatPrice(paid)} muted />
        </ValueGroup>

        {verified && history.length > 0 ? (
          <ValueGroup header="История выплат">
            {history.map((row) => (
              <ValueRow
                key={row.id}
                label={row.title || 'Выплата'}
                value={formatPrice(row.amount)}
                muted
              />
            ))}
          </ValueGroup>
        ) : (
          <Placeholder
            header="История пуста"
            description={
              verified
                ? 'Появится после первых выплат'
                : 'Сначала подтвердите реквизиты'
            }
          />
        )}
      </List>
    </SubpageLayout>
  );
}
