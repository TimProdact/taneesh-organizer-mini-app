import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
import { formatPrice } from '../utils.js';

export function FinancePage({ snapshot }) {
  const finance = snapshot.finance || {};
  const hold = finance.hold ?? 0;
  const paid = finance.totalPaid ?? 0;
  const history = finance.history || [];

  return (
    <SubpageLayout>
      <PageHeader title="Финансы" subtitle="Выплаты и реквизиты" />
      <div className="fm-page-body">
        <ValueGroup>
          <ValueRow label="В ожидании (Hold)" value={formatPrice(hold)} muted />
          <ValueRow label="Всего выплачено" value={formatPrice(paid)} last />
        </ValueGroup>

        {history.length > 0 ? (
          <ValueGroup className="fm-value-group--spaced">
            {history.map((row, i) => (
              <ValueRow
                key={row.id || i}
                label={row.title || 'Выплата'}
                value={formatPrice(row.amount)}
                last={i === history.length - 1}
              />
            ))}
          </ValueGroup>
        ) : (
          <p className="fm-empty-hint">История выплат появится после верификации и первых продаж</p>
        )}
      </div>
    </SubpageLayout>
  );
}
