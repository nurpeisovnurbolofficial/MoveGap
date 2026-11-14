import type { PlanResult } from '../../domain/types';
import { money, shortDate } from '../../shared/format';
import { Panel } from '../../shared/ui';
import { localDateToday, nextUnpaidExpense } from './paymentInsights';
import './UpcomingPayment.css';

export function UpcomingPayment({ plan, asOf = localDateToday(), onRecord }: {
  plan: PlanResult; asOf?: string; onRecord: (eventId: string) => void;
}) {
  const next = nextUnpaidExpense(plan, asOf);
  const fullDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${asOf}T00:00:00Z`));
  return <Panel title="Next unpaid expense" aside={<span className="count-tag">As of {fullDate}</span>}>
    {next ? <div className={`upcoming-payment ${next.overdueCount ? 'is-overdue' : ''}`}>
      <div><span className="caption">{next.overdueCount ? `${next.overdueCount} OVERDUE` : 'COMING UP'}</span>
        <strong>{next.row.label}</strong><span>{shortDate(next.row.date)} · {money(next.row.effectiveAmountCents)}</span>
        <small>{next.overdueCount ? 'This planned expense has no recorded payment.' : 'Record the actual amount and date once it happens.'}</small></div>
      <button type="button" className="button secondary small" onClick={() => onRecord(next.row.eventId)}>Record actual</button>
    </div> : <p className="payment-history-empty">No unpaid expenses remain in this selected 60-day plan.</p>}
  </Panel>;
}
