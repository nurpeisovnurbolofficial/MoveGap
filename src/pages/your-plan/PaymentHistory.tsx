import { getPaymentHistory } from '../../domain/payments';
import type { MoveInput, PlanResult } from '../../domain/types';
import { money, shortDate } from '../../shared/format';
import { Panel } from '../../shared/ui';
import './PaymentHistory.css';

const exclusionText = {
  'before-start': 'Before the plan starts; assumed in opening cash',
  'after-window': 'Outside the 60-day forecast',
  'expected-refund': 'Expected only; no money received',
  'unconfirmed-income': 'Unconfirmed income',
};

export function PaymentHistory({ input, plan, onRecord }: {
  input: MoveInput; plan?: PlanResult; onRecord: (id: string) => void;
}) {
  const entries = getPaymentHistory(input).filter(row => row.event.actual)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.event.id.localeCompare(b.event.id));
  const included = new Set(plan?.timeline.map(row => row.eventId) ?? []);
  return <Panel title="Recorded payment history" aside={<span className="count-tag">{entries.length} recorded</span>}>
    <p className="panel-intro">Every recorded payment stays here, including earlier options and dates outside this forecast. Clearing a mistaken record does not refund money.</p>
    {entries.length === 0 ? <p className="payment-history-empty">No actual payments recorded yet.</p> :
      <div className="payment-history-list">{entries.map(({ event, ownerLabel, effectiveDate, exclusion }) => {
        const status = !plan ? 'No plan selected; not compared'
          : included.has(event.id) ? 'Included in this forecast'
            : exclusion ? exclusionText[exclusion] : 'Not part of this selected option';
        return <div className="payment-history-row" key={event.id}>
          <div><strong>{event.label}</strong><small>{ownerLabel} · {status}</small><small>Planned {shortDate(event.date)} · {money(event.amountCents)}</small></div>
          <div className="payment-history-action"><strong>{shortDate(effectiveDate)} · {money(event.actual!.amountCents)}</strong><button type="button" className="text-button" onClick={() => onRecord(event.id)}>Edit or clear actual</button></div>
        </div>;
      })}</div>}
  </Panel>;
}
