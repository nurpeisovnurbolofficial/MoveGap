import { useRef, useState, type Ref } from 'react';
import type { ComparisonResult, MoveInput, PlanResult } from '../../domain/types';
import { CashChart } from '../../components/CashChart';
import { Icon } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import {
  closestPlan, criticalDay, daysBetween, highlights, isEligible, lowestIndex, moneyStatus, optionRows, planOptions, toneOf, unconfirmedItems,
  type Highlight, type HighlightKey, type MoneyStatus,
} from './planInsights';
import './ComparePlansPage.css';
import { calculatePlans } from '../../domain/engine';
import { delayIncome, delayableIncome } from './explorationData';
import { CashCalendar, OptionMatrix, PlanRecovery, ScenarioControls } from './PlanningTools';

const statusText: Record<MoneyStatus, string> = { fits: 'Keeps your reserve', reserve: 'Uses your reserve', short: 'Not enough cash' };
const statusBadge: Record<MoneyStatus, string> = { fits: 'green', reserve: 'red', short: 'red' };
const signed = (cents: number, change: number) => `${change > 0 ? '+' : '−'}${money(cents)}`;
const later = (from: string, to: string) => {
  const days = daysBetween(from, to);
  return days <= 0 ? 'the same day' : days === 1 ? '1 day later' : `${days} days later`;
};

type Props = {
  input: MoveInput;
  result: ComparisonResult;
  onChoose: (id: string) => void;
  onBack: () => void;
  /** Optional: the plan chosen earlier, so returning to this page shows it. */
  currentPlanId?: string | null;
};

/** All financial outcomes and recommendation IDs come from the shared engine. */
export function ComparePlansPage({ input: originalInput, result: originalResult, onChoose, onBack, currentPlanId = null }: Props) {
  const [scenarioOn, setScenarioOn] = useState(false);
  const [incomeId, setIncomeId] = useState('');
  const [delayDays, setDelayDays] = useState(2);
  const incomes = originalResult.errors.length ? [] : delayableIncome(originalInput, originalResult.horizonEnd);
  const selectedIncomeId = incomes.find(event => event.id === incomeId)?.id ?? incomes[0]?.id ?? '';
  const scenarioActive = scenarioOn && !!selectedIncomeId && !originalResult.errors.length;
  const input = scenarioActive ? delayIncome(originalInput, selectedIncomeId, delayDays) : originalInput;
  const result = scenarioActive ? calculatePlans(input) : originalResult;
  const choosePlan = (id: string) => { if (!scenarioActive) onChoose(id); };
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const summary = highlights(result);
  const focused = result.plans.find(p => p.id === focusedId)
    ?? result.plans.find(p => p.id === currentPlanId)
    ?? result.plans.find(p => p.id === (summary.bestFitId ?? result.largestBufferPlanId))
    ?? closestPlan(result);
  const number = (id: string) => result.plans.findIndex(p => p.id === id) + 1;
  const sameCosts = result.plans.length > 1 && result.plans.every(p => p.costCents === result.plans[0].costCents);
  const smooth = () => typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function showDetail(id: string) {
    setFocusedId(id);
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView({ block: 'start', behavior: smooth() ? 'smooth' : 'auto' });
  }
  function showCard(id: string) {
    setFocusedId(id);
    const card = document.getElementById(`compare-card-${number(id)}`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'start', behavior: smooth() ? 'smooth' : 'auto' });
  }

  const heading = <div className="page-heading"><h1>Compare your moving options.</h1><p>See which dates work with the money you have — and exactly which payment causes trouble.</p></div>;

  if (result.errors.length > 0) {
    return <div className="compare-plans-page">{heading}
      <div className="empty-state" role="alert"><h2>Fix your information to compare plans.</h2><ul className="compare-errors">{result.errors.map(error => <li key={error}>{error}</li>)}</ul><button className="button primary" onClick={onBack}><Icon name="back" size={17}/>Edit your move</button></div>
    </div>;
  }
  if (!focused) {
    return <div className="compare-plans-page">{heading}
      <div className="empty-state"><Icon name="calendar" size={36}/><h2>These dates don’t work together.</h2><p>No housing and moving options can be combined. Check when the home is available and your latest moving date.</p>
        {result.rejected.length > 0 && <RejectedList input={input} result={result}/>}
        <button className="button primary" onClick={onBack}><Icon name="back" size={17}/>Edit your move</button></div>
    </div>;
  }

  return <div className="compare-plans-page">
    {heading}
    <ScenarioControls input={originalInput} original={originalResult} current={result} eventId={selectedIncomeId} days={delayDays} active={scenarioActive} onEvent={setIncomeId} onDays={setDelayDays} onActive={setScenarioOn}/>
    <DecisionSummary result={result} input={input} summary={summary} number={number} currentPlanId={currentPlanId} onChoose={choosePlan} onBack={onBack} onShowCard={showCard} previewOnly={scenarioActive}/>
    <OptionMatrix input={input} result={result} focusedId={focused.id} onSelect={showDetail}/>

    <div className="comparison-grid">{result.plans.map(plan => <PlanCard key={plan.id} plan={plan} number={number(plan.id)} input={input}
      badges={summary.bestFitId === plan.id ? ['Best fit'] : summary.items.filter(item => item.winnerIds.includes(plan.id)).map(item => item.winnerIds.length > 1 ? `${item.label} · tie` : item.label)}
      focused={focused.id === plan.id} current={currentPlanId === plan.id} onChoose={() => choosePlan(plan.id)} onShow={() => showDetail(plan.id)} previewOnly={scenarioActive}/>)}</div>

    <div className="compare-notes">
      {sameCosts && <p><Icon name="info" size={16}/><span>All plans have the same spending ({money(result.plans[0].costCents)}). Different payment dates change <em>when</em> you need cash, not how much you spend.</span></p>}
      <p><Icon name="info" size={16}/><span>Highlights compare only confirmed plans that keep your reserve. Spending leaves out refundable deposits.</span></p>
      {result.rejected.length > 0 && <RejectedList input={input} result={result}/>}
    </div>

    <PlanDetail ref={detailRef} plan={focused} input={input} plans={result.plans} number={number} current={currentPlanId === focused.id} onSelect={setFocusedId} onChoose={() => choosePlan(focused.id)} previewOnly={scenarioActive} onRestore={() => setScenarioOn(false)}/>
    <PlanRecovery key={`${focused.id}-${scenarioActive}-${delayDays}-${selectedIncomeId}`} input={input} plan={focused} number={number(focused.id)} onBack={onBack}/>

    <details className="assumptions"><summary><Icon name="info" size={17}/>How this comparison works</summary>
      <p>Only the payments and income you entered within the same 60-day period are included. Expected deposit returns and unconfirmed income are left out until received or confirmed. Refundable deposits reduce your available cash, but are not counted as spending.</p>
      <p>Payments go out before income on the same day. Actual payments replace planned payments. Changing a moving date does not move your rent or deposit deadlines. A plan that needs confirmation is not a confirmed recommendation.</p>
    </details>
  </div>;
}

function RejectedList({ input, result }: { input: MoveInput; result: ComparisonResult }) {
  const count = result.rejected.length;
  return <div className="compare-rejected">
    <p><Icon name="calendar" size={16}/><strong>{count} {count === 1 ? 'combination isn’t' : 'combinations aren’t'} shown because the dates don’t work together:</strong></p>
    <ul>{result.rejected.map(item => <li key={`${item.housingId}-${item.movingId}`}>{input.housingOptions.find(h => h.id === item.housingId)?.label} + {input.movingOptions.find(m => m.id === item.movingId)?.label} — {item.reason}</li>)}</ul>
  </div>;
}

function DecisionSummary({ result, input, summary, number, currentPlanId, onChoose, onBack, onShowCard, previewOnly = false }: {
  result: ComparisonResult; input: MoveInput; summary: ReturnType<typeof highlights>; number: (id: string) => number;
  currentPlanId: string | null; onChoose: (id: string) => void; onBack: () => void; onShowCard: (id: string) => void;
  previewOnly?: boolean;
}) {
  const reserve = money(input.reserveCents);
  const { eligible, items, bestFitId } = summary;
  const conditional = result.plans.filter(p => p.needsConfirmation);
  const conditionalNote = conditional.length > 0 && <p className="compare-summary-note"><Icon name="info" size={15}/>{conditional.length} {conditional.length === 1 ? 'plan needs' : 'plans need'} confirmation before you rely on the terms.</p>;
  const editButton = (primary: boolean) => <button className={`button ${primary ? 'primary' : 'secondary'}`} onClick={onBack}><Icon name="back" size={16}/>Edit your move</button>;

  if (!eligible.length) {
    const fitIfConfirmed = conditional.filter(p => p.meetsReserve).length;
    const closest = closestPlan(result);
    return <section className="compare-summary warning" aria-labelledby="compare-summary-title">
      <span className="insight-icon"><Icon name="info"/></span>
      <div className="compare-summary-body">
        <span className="eyebrow">NO PLAN FITS YET</span>
        <h2 id="compare-summary-title">No confirmed plan keeps your {reserve} reserve.</h2>
        {fitIfConfirmed > 0
          ? <p>{result.plans.every(p => p.meetsReserve) ? 'The amounts work, but the terms aren’t confirmed yet.' : `${fitIfConfirmed} ${fitIfConfirmed === 1 ? 'plan would' : 'plans would'} keep your reserve once the terms are confirmed.`} Mark terms as confirmed on Your move only after the landlord or mover agrees.</p>
          : <p>Closest: <strong>Plan {number(closest.id)} · Move {shortDate(closest.moveDate)}</strong> still needs <strong>{money(closest.gapToReserveCents)} more</strong> to keep your reserve.</p>}
        <p className="compare-summary-muted">You can change your starting cash, your reserve, or payment dates you have actually agreed on. A different moving day doesn’t move the landlord’s deadlines.</p>
        {conditionalNote}
      </div>
      <div className="compare-summary-actions">{editButton(true)}</div>
    </section>;
  }

  if (bestFitId) {
    const plan = result.plans.find(p => p.id === bestFitId)!;
    const { housing, moving } = planOptions(plan, input);
    const reason = result.plans.length === 1 ? `Your plan is confirmed and keeps your ${reserve} reserve.`
      : eligible.length === 1 ? `The only one of your ${result.plans.length} plans that is confirmed and keeps your ${reserve} reserve.`
      : `Earliest move, lowest cost and most cash left of the ${eligible.length} confirmed plans that keep your ${reserve} reserve.`;
    return <section className="compare-summary good" aria-labelledby="compare-summary-title">
      <span className="insight-icon"><Icon name="check"/></span>
      <div className="compare-summary-body">
        <span className="eyebrow">BEST FIT</span>
        <h2 id="compare-summary-title">Plan {number(plan.id)} · Move {shortDate(plan.moveDate)}</h2>
        <p className="compare-summary-options">{housing?.label} · {moving?.label}</p>
        <p>{reason}</p>
        <dl className="compare-summary-stats">
          <div><dt>Lowest balance</dt><dd>{money(plan.minBalanceCents)} <small>on {shortDate(plan.minBalanceDate)}</small></dd></div>
          <div><dt>Spending</dt><dd>{money(plan.costCents)}</dd></div>
          <div><dt>Cash on day 60</dt><dd>{money(plan.endingBalanceCents)}</dd></div>
        </dl>
        {conditionalNote}
      </div>
      <div className="compare-summary-actions">
        <button className="button primary" disabled={previewOnly} onClick={() => onChoose(plan.id)}>{previewOnly ? 'What-if preview only' : <>{plan.id === currentPlanId ? 'Continue with' : 'Choose'} Plan {number(plan.id)}</>}<Icon name="arrow" size={16}/></button>
        {editButton(false)}
      </div>
    </section>;
  }

  const value = (key: HighlightKey, plan: PlanResult) => key === 'earliest' ? `Move ${shortDate(plan.moveDate)}`
    : key === 'cheapest' ? `${money(plan.costCents)} spending` : `${money(plan.minBalanceCents)} at the lowest point`;
  const winners = (item: Highlight) => item.winnerIds.length === 1 ? `Plan ${number(item.winnerIds[0])}`
    : `Tie · Plans ${item.winnerIds.map(number).sort((a, b) => a - b).join(', ')}`;
  return <section className="compare-summary good" aria-labelledby="compare-summary-title">
    <span className="insight-icon"><Icon name="check"/></span>
    <div className="compare-summary-body">
      <span className="eyebrow">{eligible.length} OF {result.plans.length} PLANS FIT</span>
      <h2 id="compare-summary-title">{eligible.length} of {result.plans.length} plans are confirmed and keep your {reserve} reserve.</h2>
      <p>They are best at different things. Pick what matters most to you:</p>
      <div className="compare-picks">{items.map(item => {
        const plan = result.plans.find(p => p.id === item.winnerIds[0])!;
        return <button key={item.key} className="compare-pick" onClick={() => onShowCard(plan.id)} aria-label={`${item.label}: ${winners(item)}, ${value(item.key, plan)}. Show plan.`}>
          <span>{item.label}</span><strong>{winners(item)}</strong><small>{value(item.key, plan)}</small>
        </button>;
      })}</div>
      {conditionalNote}
    </div>
    <div className="compare-summary-actions">{editButton(false)}</div>
  </section>;
}

function PlanCard({ plan, number, input, badges, focused, current, onChoose, onShow, previewOnly = false }: {
  plan: PlanResult; number: number; input: MoveInput; badges: string[]; focused: boolean; current: boolean; onChoose: () => void; onShow: () => void;
  previewOnly?: boolean;
}) {
  const status = moneyStatus(plan);
  const { housing, moving } = planOptions(plan, input);
  const rows = optionRows(plan, input);
  const unconfirmed = plan.needsConfirmation ? unconfirmedItems(plan, input) : [];
  const headingId = `compare-plan-${number}`;
  return <article id={`compare-card-${number}`} tabIndex={-1} className={`plan-card tone-${toneOf(plan)}${focused ? ' focused' : ''}`} aria-labelledby={headingId}>
    <div className="plan-card-top">
      <span className="plan-number">PLAN {number}</span>
      <span className="compare-badges">
        {current && <span className="badge blue">Your current plan</span>}
        <span className={`badge ${statusBadge[status]}`}>{statusText[status]}</span>
        {plan.needsConfirmation && <span className="badge amber">Needs confirmation</span>}
      </span>
    </div>
    <h2 id={headingId}>Move {shortDate(plan.moveDate)}</h2>
    <p className="plan-description">{housing?.label} · {moving?.label}</p>
    <ul className="compare-chips" aria-label="Key dates">
      <li><Icon name="home" size={14}/>Home from <strong>{shortDate(housing?.availableFrom ?? '')}</strong></li>
      <li><Icon name="truck" size={14}/>Moving day <strong>{shortDate(plan.moveDate)}</strong></li>
    </ul>
    {badges.length > 0 && <div className="compare-highlights">{badges.map(badge => <span key={badge} className={`badge ${badge === 'Best fit' ? 'green' : 'blue'}`}>{badge === 'Best fit' && <Icon name="check" size={13}/>}{badge}</span>)}</div>}

    <div className="compare-metric">
      <span>Lowest cash balance</span>
      <strong className={plan.meetsReserve ? '' : 'negative'}>{money(plan.minBalanceCents)}</strong>
      <small>on {shortDate(plan.minBalanceDate)} · your reserve is {money(input.reserveCents)}</small>
    </div>
    <Outcome plan={plan} input={input}/>
    <CriticalDayBox plan={plan} input={input}/>

    {rows.length > 0 && <div className="compare-option-payments">
      <h3>Payments for this option</h3>
      <ul>{rows.map(row => <li key={row.eventId}><span className="compare-date">{shortDate(row.date)}</span><span className="compare-option-label">{row.label}</span><strong>{signed(row.effectiveAmountCents, row.cashChangeCents)}</strong></li>)}</ul>
    </div>}

    <dl className="compare-facts">
      <div><dt>Spending</dt><dd>{money(plan.costCents)}</dd></div>
      <div><dt>Deposits</dt><dd>{money(plan.depositOutflowCents)}</dd></div>
      <div><dt>Day 60</dt><dd>{money(plan.endingBalanceCents)}</dd></div>
    </dl>
    {unconfirmed.length > 0 && <p className="compare-confirm-note"><strong>Confirm before relying on it:</strong> {unconfirmed.join(', ')}.</p>}

    <div className="compare-card-actions">
      <button className={`button ${isEligible(plan) ? 'primary' : 'secondary'} full-width`} disabled={previewOnly} aria-label={previewOnly ? `Plan ${number}: return to original dates to choose` : `${current ? 'Continue with' : 'Choose'} Plan ${number}, move ${shortDate(plan.moveDate)}`} onClick={onChoose}>{previewOnly ? 'Return to original dates to choose' : current ? 'Continue with this plan' : 'Choose this plan'}<Icon name="arrow" size={17}/></button>
      <button className="preview-button" aria-pressed={focused} aria-controls="compare-detail" onClick={onShow}><Icon name="chart" size={16}/>{focused ? 'Shown in detail below' : 'All payments & chart'}</button>
    </div>
  </article>;
}

function Outcome({ plan, input }: { plan: PlanResult; input: MoveInput }) {
  if (plan.meetsReserve) return <p className="compare-outcome">Your cash stays at or above your reserve for all 60 days.{plan.needsConfirmation && ' This depends on terms that are not yet confirmed.'}</p>;
  const firstShort = plan.timeline.find(row => row.balanceCents < 0);
  const firstReserve = plan.timeline.find(row => row.balanceCents < input.reserveCents);
  const startsBelow = input.openingCashCents < input.reserveCents;
  return <div className="compare-outcome">
    <p className="compare-need">You need <strong>{money(plan.gapToReserveCents)} more</strong> to keep your reserve{plan.gapToZeroCents > 0 ? <> — <strong>{money(plan.gapToZeroCents)}</strong> just to cover every payment.</> : '. Every payment is covered.'}</p>
    {/* Same-day details are shown in the critical-day box below; only earlier dates are repeated here. */}
    {startsBelow ? <p>Your starting cash is already below your reserve, before any payments.</p>
      : firstReserve && firstReserve.date !== plan.minBalanceDate && <p><strong>Below your reserve from {shortDate(firstReserve.date)}</strong>, after {firstReserve.label} ({money(firstReserve.effectiveAmountCents)}).</p>}
    {firstShort && firstShort.date !== plan.minBalanceDate && <p><strong>First payment you can’t cover:</strong> {firstShort.label} ({money(firstShort.effectiveAmountCents)}) on {shortDate(firstShort.date)}.</p>}
  </div>;
}

function CriticalDayBox({ plan, input }: { plan: PlanResult; input: MoveInput }) {
  const day = criticalDay(plan, input);
  const tone = plan.meetsReserve ? 'ok' : 'bad';
  const firstShortId = plan.timeline.find(row => row.balanceCents < 0)?.eventId;
  const firstReserveId = input.openingCashCents < input.reserveCents ? undefined : plan.timeline.find(row => row.balanceCents < input.reserveCents)?.eventId;
  if (day.lowestIsOpening) return <div className={`compare-critical ${tone}`}><p className="compare-critical-title">Lowest point · {shortDate(day.date)}</p><p className="compare-critical-text">Your lowest balance is your starting cash, before any payments.</p></div>;
  return <div className={`compare-critical ${tone}`}>
    <p className="compare-critical-title">{plan.meetsReserve ? 'Tightest day' : 'Critical day'} · {shortDate(day.date)}</p>
    <p className="compare-critical-text">You start the day with <strong>{money(day.startBalanceCents)}</strong>.</p>
    <ol>{day.rows.map((row, index) => <li key={row.eventId} className={index === day.rows.length - 1 ? 'is-lowest' : ''}>
      <span>{row.label}{row.eventId === firstShortId ? <small className="compare-critical-tag red">Can’t cover this payment</small>
        : row.eventId === firstReserveId && <small className="compare-critical-tag">Drops below your reserve</small>}</span><span className="compare-critical-amount">{signed(row.effectiveAmountCents, row.cashChangeCents)}</span>
      <span className={`compare-critical-balance ${row.balanceCents < input.reserveCents ? 'negative' : ''}`}><span aria-hidden="true">→ </span><span className="visually-hidden">leaves </span>{money(row.balanceCents)}</span>
    </li>)}</ol>
    <p className="compare-critical-next">{day.nextIncome
      ? <><Icon name="wallet" size={15}/><span>Next money in: <strong>{day.nextIncome.label} +{money(day.nextIncome.effectiveAmountCents)}</strong> on {shortDate(day.nextIncome.date)} — {later(day.date, day.nextIncome.date)}.</span></>
      : <><Icon name="info" size={15}/><span>No money comes in after this within the 60 days.</span></>}</p>
  </div>;
}

function PlanDetail({ ref, plan, input, plans, number, current, onSelect, onChoose, previewOnly = false, onRestore }: {
  ref: Ref<HTMLElement>; plan: PlanResult; input: MoveInput; plans: PlanResult[]; number: (id: string) => number; current: boolean; onSelect: (id: string) => void; onChoose: () => void;
  previewOnly?: boolean;
  onRestore: () => void;
}) {
  const { housing, moving } = planOptions(plan, input);
  const lowest = lowestIndex(plan);
  const firstShort = plan.timeline.findIndex(row => row.balanceCents < 0);
  const n = number(plan.id);
  return <section id="compare-detail" ref={ref} tabIndex={-1} className="panel compare-detail" aria-labelledby="compare-detail-title">
    <div className="compare-detail-head">
      <div>
        <span className="eyebrow">PLAN DETAIL</span>
        <h2 id="compare-detail-title">Plan {n} · Move {shortDate(plan.moveDate)}</h2>
        <p>{housing?.label} · {moving?.label}</p>
      </div>
      {plans.length > 1 && <div className="compare-tabs" role="group" aria-label="Plan to show">{plans.map(p => <button key={p.id} aria-pressed={p.id === plan.id} onClick={() => onSelect(p.id)}><i className={`compare-dot tone-${toneOf(p)}`} aria-hidden="true"/>Plan {number(p.id)}</button>)}</div>}
    </div>

    {previewOnly && <div className="scenario-detail-note"><p><strong>What-if results.</strong> These dates are a test, not your saved plan.</p><button className="button secondary" onClick={onRestore}>Stop testing this delay</button></div>}
    <dl className="compare-detail-stats">
      <div><dt>Lowest balance</dt><dd className={plan.meetsReserve ? '' : 'negative'}>{money(plan.minBalanceCents)}</dd><small>on {shortDate(plan.minBalanceDate)}</small></div>
      <div><dt>Below your reserve</dt><dd>{plan.firstBelowReserveDate ? `from ${shortDate(plan.firstBelowReserveDate)}` : 'Never'}</dd><small>reserve {money(input.reserveCents)}</small></div>
      <div><dt>Extra needed</dt><dd className={plan.gapToReserveCents ? 'negative' : ''}>{money(plan.gapToReserveCents)}</dd><small>{plan.gapToZeroCents ? `${money(plan.gapToZeroCents)} to stay above $0` : 'to keep your reserve'}</small></div>
      <div><dt>Cash on day 60</dt><dd>{money(plan.endingBalanceCents)}</dd><small>after every entered payment</small></div>
    </dl>

    <CashCalendar key={`${plan.id}-${input.startDate}`} input={input} plan={plan}/>
    <h3 className="compare-detail-subhead">Cash after each payment</h3>
    <p className="compare-help">The line steps down for each payment and up for money received. The shaded area is below your {money(input.reserveCents)} reserve.</p>
    <p className="compare-scroll-hint">Swipe sideways to see all 60 days.</p>
    <div className="compare-chart-scroll" tabIndex={0} role="region" aria-label="Cash flow chart. Scroll horizontally on small screens."><CashChart input={input} plan={plan}/></div>

    <h3 className="compare-detail-subhead">Every payment and payday, in order</h3>
    <p className="compare-help">Payments go out before income on the same day. Actual payments replace planned ones.</p>
    <div className="compare-events-head" aria-hidden="true"><span>Date</span><span>Payment</span><span>Amount</span><span>Cash left</span></div>
    <ol className="compare-events">
      <li className="is-start"><span className="compare-event-date">{shortDate(input.startDate)}</span><div className="compare-event-name"><strong>Starting cash</strong><small>Available on your start date</small></div><span className="compare-event-change"/><span className="compare-event-balance">{money(input.openingCashCents)}</span></li>
      {plan.timeline.map((row, index) => {
        const tags = [row.isActual ? 'Actual' : 'Planned', row.kind === 'refundable-deposit' && 'Refundable deposit', row.kind === 'income' && 'Money in',
          row.isActual && row.date !== row.plannedDate && `planned ${shortDate(row.plannedDate)}`].filter(Boolean);
        const below = row.balanceCents < input.reserveCents;
        return <li key={row.eventId} className={[below && 'below-reserve', index === lowest && 'is-lowest'].filter(Boolean).join(' ')}>
          <span className="compare-event-date">{shortDate(row.date)}</span>
          <div className="compare-event-name"><strong>{row.label}</strong><small>{tags.join(' · ')}</small>
            {(index === lowest || index === firstShort) && <span className="compare-flags">
              {index === firstShort && <span className="compare-flag red">First payment you can’t cover</span>}
              {index === lowest && <span className="compare-flag">Lowest balance in this plan</span>}
            </span>}
          </div>
          <span className={`compare-event-change ${row.cashChangeCents > 0 ? 'in' : ''}`}>{signed(row.effectiveAmountCents, row.cashChangeCents)}</span>
          <span className={`compare-event-balance ${below ? 'negative' : ''}`}><span className="compare-mobile-label">Cash left </span>{money(row.balanceCents)}</span>
        </li>;
      })}
    </ol>
    {plan.timeline.length === 0 && <p className="compare-help">No payments or income are included in this 60-day period.</p>}
    {plan.warnings.length > 0 && <div className="compare-warnings"><strong>Check these assumptions</strong><ul>{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
    <div className="compare-detail-actions">
      <button className={`button ${isEligible(plan) ? 'primary' : 'secondary'}`} disabled={previewOnly} onClick={onChoose}>{previewOnly ? 'Return to original dates to choose' : <>{current ? 'Continue with' : 'Choose'} Plan {n}</>}<Icon name="arrow" size={16}/></button>
    </div>
  </section>;
}
