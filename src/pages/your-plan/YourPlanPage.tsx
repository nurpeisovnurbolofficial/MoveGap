import { calculatePlans } from '../../domain/engine';
import type { MoveInput, PaymentEvent, PlanResult } from '../../domain/types';
import { Icon, Panel } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { PaymentHistory } from './PaymentHistory';
import { PlanBackup } from './PlanBackup';
import { UpcomingPayment } from './UpcomingPayment';
import './YourPlanPage.css';

function withoutFacts(input: MoveInput): MoveInput {
  const planned = (events: PaymentEvent[]) => events.map(({ actual: _actual, ...event }) => event);
  return { ...input, commonEvents: planned(input.commonEvents),
    housingOptions: input.housingOptions.map(option => ({ ...option, events: planned(option.events) })),
    movingOptions: input.movingOptions.map(option => ({ ...option, events: planned(option.events) })) };
}

/** Sasha owns this page, saved-plan behavior and the pitch deck. */
export function YourPlanPage({ input, plan, onCompare, onSave, onRecord, savedAt, dirty }: {
  input: MoveInput; plan?: PlanResult; onCompare: () => void; onSave: () => void;
  onRecord: (id: string) => void; savedAt: string | null; dirty: boolean;
}) {
  if (!plan) return <><div className="page-heading"><h1>Your plan starts with a choice.</h1><p>Compare the options for your move, then choose one to keep track of.</p></div><div className="empty-state"><Icon name="calendar" size={40}/><h2>One move. A clear schedule.</h2><p>Your payments and deposit return will appear here.</p><button className="button primary" onClick={onCompare}>Compare plans<Icon name="arrow" size={17}/></button></div><PaymentHistory input={input} onRecord={onRecord}/><PlanBackup input={input} selectedId={null}/></>;
  const refunds = input.commonEvents.filter(e => e.kind === 'deposit-refund');
  const planned = plan.timeline.some(row => row.isActual)
    ? calculatePlans(withoutFacts(input)).plans.find(candidate => candidate.id === plan.id) : null;
  const minimumChange = planned ? plan.minBalanceCents - planned.minBalanceCents : 0;
  return <><div className="page-heading"><h1>Keep your move on track.</h1><p>Keep the dates in view. Record what actually happened as you go.</p></div>
    <div className="selected-plan-banner"><span className="banner-icon"><Icon name="home" size={24}/></span><div><span className="caption">YOUR SELECTED MOVE</span><h2>{shortDate(plan.moveDate)}</h2></div><div className="banner-right"><span className={`badge ${plan.meetsReserve && !plan.needsConfirmation ? 'green' : 'amber'}`}>{plan.needsConfirmation ? 'Needs confirmation' : plan.meetsReserve ? 'Reserve preserved' : 'Reserve at risk'}</span><button className="text-button" onClick={onCompare}>Change plan<Icon name="chevron" size={16}/></button></div></div>
    <div className="plan-metrics"><div><span>Nonrefundable payments</span><strong>{money(plan.costCents)}</strong><small>Entered payments over 60 days</small></div><div><span>Lowest cash balance</span><strong className={!plan.meetsReserve ? 'negative' : ''}>{money(plan.minBalanceCents)}</strong><small>{shortDate(plan.minBalanceDate)}</small>{planned && <small className={`plan-change ${minimumChange < 0 ? 'negative' : ''}`}>{minimumChange === 0 ? 'No change from planned minimum' : `${minimumChange > 0 ? '+' : '−'}${money(Math.abs(minimumChange))} vs planned ${money(planned.minBalanceCents)}`}</small>}</div><div><span>Entries recorded</span><strong>{plan.timeline.filter(e => e.isActual).length}</strong><small>Actual amounts replace estimates</small></div></div>
    <div className="plan-layout"><div className="panel-stack"><Panel title="Your payment schedule" aside={<span className="count-tag">{plan.timeline.length} entries</span>}><p className="panel-intro">Record what happened after a payment or payday. Planned and actual values remain visible.</p><div className="schedule-list">{plan.timeline.map(row => <div className={`schedule-row ${row.isActual ? 'is-actual' : ''}`} key={row.eventId}><span className="schedule-marker" aria-hidden="true">{row.isActual ? <Icon name="check" size={13}/> : <span/>}</span><div className="schedule-description"><strong>{row.label}</strong><span className={`badge ${row.isActual ? 'green' : 'blue'}`}>{row.isActual ? row.cashChangeCents > 0 ? 'Received' : 'Paid' : row.kind === 'income' ? 'Expected income' : 'Planned'}</span><div className="schedule-values"><span>Planned <strong>{shortDate(row.plannedDate)} · {money(row.plannedAmountCents)}</strong></span><span>Actual <strong>{row.isActual ? `${shortDate(row.date)} · ${money(row.effectiveAmountCents)}` : 'Not recorded'}</strong></span></div><small>Cash after: {money(row.balanceCents)}</small></div><div className="schedule-amount"><strong>{row.cashChangeCents > 0 ? '+' : '−'}{money(row.effectiveAmountCents)}</strong><button className="text-button" onClick={() => onRecord(row.eventId)}>{row.isActual ? 'Edit actual' : 'Record actual'}</button></div></div>)}</div></Panel><div className="save-status"><Icon name="save" size={17}/><span>{savedAt ? dirty ? 'You have changes that are not saved.' : 'Your latest plan is saved in this browser.' : 'Save this plan to come back to it in this browser.'}</span><button className="button primary small" onClick={onSave}>{savedAt ? 'Save changes' : 'Save my plan'}<Icon name="arrow" size={16}/></button></div></div>
    <aside className="panel-stack">
      <Panel title="Your old deposit">
        <div className="deposit-icon"><Icon name="refresh" size={26}/></div>
        {refunds.length ? refunds.map(refund => {
          const includedInForecast = plan.timeline.some(row => row.eventId === refund.id);
          return <div className="deposit-entry" key={refund.id}>
            <span className="caption">EXPECTED RETURN</span>
            <div className="deposit-amount">{money(refund.amountCents)}</div>
            <p className="muted">Estimated date: {shortDate(refund.date)}<br/>Your estimate, not a legal deadline.</p>
            <div className="deposit-received"><span>Actually received</span><strong>{money(refund.actual?.amountCents ?? 0)}</strong></div>
            {refund.actual && <p className="deposit-fact">
              Received on {shortDate(refund.actual.date)}.{' '}
              {includedInForecast ? 'Included in this forecast at the recorded amount and date.'
                : refund.actual.date < input.startDate
                  ? 'This receipt is before your plan starts. It is assumed to be included in your opening cash and is not added again.'
                  : 'This receipt is outside this 60-day plan and is not included in the forecast.'}
            </p>}
            <button className="button secondary full-width" onClick={() => onRecord(refund.id)}>{refund.actual ? 'Update received amount' : 'Record deposit received'}</button>
          </div>;
        }) : <p className="muted">Add an expected deposit return in Move details to track it here.</p>}
        <p className="scope-note">Expected returns do not fund your move. Only receipts recorded within this 60-day plan are added to the cash forecast.</p>
      </Panel>
      <div className="note-block"><Icon name="check"/><div><strong>Counted once. Kept clear.</strong><p>An actual payment replaces its planned amount and date. Your plan is saved only in this browser.</p></div></div>
    </aside></div>
    <UpcomingPayment plan={plan} onRecord={onRecord}/>
    <PaymentHistory input={input} plan={plan} onRecord={onRecord}/>
    <PlanBackup input={input} selectedId={plan.id}/>
  </>;
}
