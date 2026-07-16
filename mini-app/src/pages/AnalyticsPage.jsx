import { List, Section, Cell, Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { InsetSection } from '../components/InsetSection.jsx';
import { runActionSafe } from '../api.js';

function FunnelRow({ label, value }) {
  return (
    <Cell subtitle={label} after={String(value)}>
      —
    </Cell>
  );
}

export function AnalyticsPage({ snapshot, onSnapshotChange }) {
  const a = snapshot.analytics || {};

  return (
    <SubpageLayout>
      <PageHeader title="Аналитика" subtitle="Воронка дропа" />
      <InsetSection>
        <List>
          <Section header="ВОРОНКА">
            <FunnelRow label="Просмотр дропа" value={a.dropViews ?? 0} />
            <FunnelRow label="Buy Now" value={a.buyNowClicks ?? 0} />
            <FunnelRow label="Checkout opened" value={a.checkoutOpens ?? 0} />
            <FunnelRow label="Hold создан" value={a.checkoutHolds ?? 0} />
            <FunnelRow label="Оплачено" value={a.checkoutPaid ?? 0} />
          </Section>
          <Section header="ОШИБКИ">
            <FunnelRow label="Hold expired" value={a.holdExpired ?? 0} />
            <FunnelRow label="Race lost" value={a.raceLost ?? 0} />
            <FunnelRow label="Payment failed" value={a.checkoutFailed ?? 0} />
          </Section>
          <Section>
            <Cell>
              <Button
                mode="plain"
                size="l"
                stretched
                onClick={async () => {
                  const next = await runActionSafe('reset_analytics');
                  onSnapshotChange(next);
                }}
              >
                Сбросить аналитику
              </Button>
            </Cell>
          </Section>
        </List>
      </InsetSection>
    </SubpageLayout>
  );
}
