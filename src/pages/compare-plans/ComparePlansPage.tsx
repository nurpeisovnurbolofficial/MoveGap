import { useRef, useState } from 'react';
import type { ComparisonResult, MoveInput, PlanResult } from '../../domain/types';
import { CashChart } from '../../components/CashChart';
import { Icon, Panel } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import './ComparePlansPage.css';

function PaymentDetails({ plan, input }: { plan: PlanResult; input: MoveInput }) {
  const firstShortfall = plan.timeline.find(row => row.balanceCents < 0);
  const firstReserve = plan.timeline.find(row => row.balanceCents < input.reserveCents);
  const minimumIndex = plan.timeline.findIndex(row => row.date === plan.minBalanceDate && row.balanceCents === plan.minBalanceCents);
  return <details className="compare-payments">
    <summary>Payment details &amp; what happens to your cash</summary>
    <div className="compare-detail-body">
      <p>Home available from {shortDate(input.housingOptions.find(h => h.id === plan.housingId)?.availableFrom ?? '')}. Moving day does not change payment deadlines.</p>
      <dl className="plan-facts">
        <div><dt>Expenses you won’t get back</dt><dd>{money(plan.costCents)}</dd></div>
        <div><dt>Refundable deposits paid</dt><dd>{money(plan.depositOutflowCents)}</dd></div>
      </dl>
      {plan.firstBelowReserveDate === input.startDate && input.openingCashCents < input.reserveCents
        ? <p>Your starting cash is already below your reserve, before any payments.</p>
        : firstReserve && <p><strong>First below your reserve: {shortDate(firstReserve.date)}</strong>, after {firstReserve.label} ({money(firstReserve.effectiveAmountCents)}). You have {money(firstReserve.balanceCents)} left.</p>}
      {firstShortfall && <p><strong>First time you can’t cover a payment: {shortDate(firstShortfall.date)}</strong>, after {firstShortfall.label} ({money(firstShortfall.effectiveAmountCents)}). Your balance would be {money(firstShortfall.balanceCents)}. You need up to <strong>{money(plan.gapToZeroCents)} more</strong> to cover all payments in this plan, without keeping your reserve.</p>}
      {minimumIndex < 0 && <p>Your lowest balance is your starting cash, before any payments.</p>}
      <p>All included payments and money received, in order. Payments go out before income on the same day.</p>
      {plan.timeline.length ? <ol className="compare-events">{plan.timeline.map((row, index) => <li key={row.eventId} className={index === minimumIndex ? 'compare-lowest-event' : ''}>
        <div><strong>{row.label}</strong><small>{shortDate(row.date)} · {row.isActual ? 'Actual' : 'Planned'}{row.kind === 'refundable-deposit' ? ' · Refundable deposit' : ''}</small>{index === minimumIndex && <small className="compare-lowest-label">Lowest balance in this plan</small>}</div>
        <div><strong>{row.cashChangeCents < 0 ? '−' : '+'}{money(row.effectiveAmountCents)}</strong><small>{money(row.balanceCents)} left</small></div>
      </li>)}</ol> : <p>No payments or income are included in this 60-day period.</p>}
      {plan.warnings.length > 0 && <div className="compare-warnings"><strong>Check these assumptions</strong><ul>{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
    </div>
  </details>;
}

/** All financial outcomes and recommendation IDs come from the shared engine. */
export function ComparePlansPage({ input, result, onChoose, onBack }: { input: MoveInput; result: ComparisonResult; onChoose: (id: string) => void; onBack: () => void }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const chartHeading = useRef<HTMLDivElement>(null);
  const focused = result.plans.find(p => p.id === focusedId) ?? result.plans.find(p => p.id === result.cheapestPlanId) ?? result.plans[0];
  const eligible = result.plans.filter(p => p.meetsReserve && !p.needsConfirmation).length;
  const conditional = result.plans.filter(p => p.needsConfirmation).length;
  const names = (plan: PlanResult) => `${input.housingOptions.find(h => h.id === plan.housingId)?.label ?? 'Housing'} · ${input.movingOptions.find(m => m.id === plan.movingId)?.label ?? 'Moving'}`;
  const focusedNumber = result.plans.findIndex(p => p.id === focused?.id) + 1;
  const sameCosts = result.plans.length > 1 && result.plans.every(p => p.costCents === result.plans[0].costCents);
  function showChart(id: string) {
    setFocusedId(id);
    chartHeading.current?.focus({ preventScroll: true });
    chartHeading.current?.scrollIntoView({ block: 'start' });
  }

  return <div className="compare-plans-page">
    <div className="page-heading"><h1>Compare your moving options.</h1><p>See which dates work with the money you have.</p></div>
    {result.errors.length > 0 ? <div className="empty-state" role="alert"><h2>Fix your information to compare plans.</h2><ul className="compare-errors">{result.errors.map(error => <li key={error}>{error}</li>)}</ul><button className="button primary" onClick={onBack}>Edit your move<Icon name="back" size={17}/></button></div>
      : !focused ? <div className="empty-state"><Icon name="calendar" size={36}/><h2>These dates don’t work together.</h2><p>No housing and moving options can be combined. Check when the home is available and your latest moving date.</p><button className="button primary" onClick={onBack}>Edit your move<Icon name="back" size={17}/></button></div> : <>
        <div className={`comparison-insight ${eligible ? '' : 'warning'}`}>
          <span className="insight-icon"><Icon name={eligible ? 'check' : 'info'}/></span>
          <div><strong>{eligible === 0 ? `No confirmed plans keep your ${money(input.reserveCents)} reserve.` : `${eligible} of ${result.plans.length} ${result.plans.length === 1 ? 'plan is' : 'plans are'} confirmed and keep your ${money(input.reserveCents)} reserve.`}</strong>
            <p>Your reserve is the money you want to leave untouched throughout the 60-day plan.</p>
            {eligible === 0 && <p>{result.plans.every(p => p.meetsReserve) ? 'The amounts fit, but the terms still need confirmation.' : 'Some payments leave too little cash. Review the amounts and dates below, or edit your move.'}</p>}
            {conditional > 0 && <p>{conditional} {conditional === 1 ? 'plan needs' : 'plans need'} confirmation before you can rely on the terms.</p>}
          </div>
          <button className={eligible ? 'button secondary' : 'button primary'} onClick={onBack}>Edit your move<Icon name="back" size={16}/></button>
        </div>
        <div className="comparison-grid">{result.plans.map((plan, index) => <article className={`plan-card ${focused.id === plan.id ? 'focused' : ''}`} key={plan.id} aria-labelledby={`compare-plan-${index}`}>
          <div className="plan-card-top"><span className="plan-number">PLAN {index + 1}</span><span className={`badge ${plan.needsConfirmation ? 'amber' : plan.meetsReserve ? 'green' : 'red'}`}>{plan.needsConfirmation ? 'Needs confirmation' : plan.meetsReserve ? 'Keeps your reserve' : plan.firstBelowZeroDate ? 'Not enough cash' : 'Uses your reserve'}</span></div>
          <h2 id={`compare-plan-${index}`}>Move {shortDate(plan.moveDate)}</h2><p className="plan-description">{names(plan)}</p>
          <div className="compare-highlights">
            {plan.id === result.earliestPlanId && <span className="badge blue">Earliest that fits</span>}
            {plan.id === result.cheapestPlanId && <span className="badge green">Lowest cost</span>}
            {plan.id === result.largestBufferPlanId && <span className="badge blue">Most cash left at the lowest point</span>}
          </div>
          <div className="plan-key-value"><span>Lowest cash balance</span><strong className={!plan.meetsReserve ? 'negative' : ''}>{money(plan.minBalanceCents)}</strong><small>On {shortDate(plan.minBalanceDate)}</small></div>
          <p className="compare-outcome">{plan.meetsReserve ? 'Your cash stays at or above your reserve.' : <>You need <strong>{money(plan.gapToReserveCents)} more</strong> to make every payment and keep your reserve.</>}{plan.needsConfirmation && ' This depends on terms that are not yet confirmed.'}</p>
          <PaymentDetails plan={plan} input={input}/>
          <div className="compare-card-actions"><button className="button primary full-width" aria-label={`Choose this plan: Plan ${index + 1}, move ${shortDate(plan.moveDate)}`} onClick={() => onChoose(plan.id)}>Choose this plan<Icon name="arrow" size={17}/></button>
            <button className="preview-button" aria-pressed={focused.id === plan.id} aria-controls="compare-cash-flow" aria-label={`View cash flow for Plan ${index + 1}`} onClick={() => showChart(plan.id)}><Icon name="chart" size={16}/>View cash flow{focused.id === plan.id ? ' · Shown below' : ''}</button></div>
        </article>)}</div>
        <p className="compare-cost-note">{sameCosts ? 'These plans have the same expenses. Different payment dates change when you need cash, not how much you spend. ' : ''}Highlights compare confirmed plans that keep your reserve. If plans tie, one is highlighted. Cost excludes refundable deposits.</p>
        <div id="compare-cash-flow" ref={chartHeading} tabIndex={-1} className="compare-chart-section" aria-label={`Cash flow for Plan ${focusedNumber}`}>
          <Panel title={`Cash flow · Plan ${focusedNumber}`} aside={<span className="badge blue">Move {shortDate(focused.moveDate)}</span>}>
            <p className="panel-intro">{names(focused)}</p>
            <p className="compare-chart-help">The line shows your cash after each payment or money received. The shaded area is below your reserve.</p>
            <p className="compare-scroll-hint">Scroll sideways to see all 60 days.</p>
            <div className="compare-chart-scroll" tabIndex={0} role="region" aria-label="Cash flow chart. Scroll horizontally on small screens."><CashChart input={input} plan={focused}/></div>
            <p className="compare-chart-help">Cash left at the end of 60 days: <strong>{money(focused.endingBalanceCents)}</strong>. Check the plan’s payment details above for each event and its effect on your cash.</p>
          </Panel>
        </div>
        <details className="assumptions"><summary><Icon name="info" size={17}/>How this comparison works</summary><p>Only the payments and income you entered within the same 60-day period are included. Expected deposit returns and unconfirmed income are excluded until received or confirmed, respectively. Refundable deposits reduce your available cash, but are not included in cost.</p><p>Payments go out before income on the same day. Actual payments replace planned payments. Changing a moving date does not move your rent or deposit deadlines. A plan that needs confirmation is not a confirmed recommendation.</p>
          {result.rejected.length > 0 && <><p>{result.rejected.length} {result.rejected.length === 1 ? 'combination was' : 'combinations were'} left out because the dates don’t work together:</p><ul>{result.rejected.map((item, index) => <li key={index}>{input.housingOptions.find(h => h.id === item.housingId)?.label} / {input.movingOptions.find(m => m.id === item.movingId)?.label}: {item.reason}</li>)}</ul></>}
        </details>
      </>}
  </div>;
}
