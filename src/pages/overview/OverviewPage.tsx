import type { ComparisonResult, MoveInput, PlanResult } from '../../domain/types';
import { CashChart } from '../../components/CashChart';
import { Icon } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { closestPlan, highlights, isEligible } from '../compare-plans/planInsights';
import './OverviewPage.css';

export function OverviewPage({ input, result, selected, source, onEdit, onCompare, onTrack, onStartOwn }: {
  input: MoveInput; result: ComparisonResult; selected?: PlanResult; source: 'example' | 'own' | 'saved';
  onStartOwn?: () => void; onEdit: () => void; onCompare: () => void; onTrack: () => void;
}) {
  // Lead with the answer: the engine's best confirmed plan, else the one closest to working.
  const ready = result.errors.length === 0 && result.plans.length > 0;
  const summary = highlights(result);
  const best = result.plans.find(p => p.id === (summary.bestFitId ?? result.largestBufferPlanId)) ?? (result.plans.length ? closestPlan(result) : undefined);
  const plan = selected ?? best;
  const suitable = result.plans.filter(p => p.meetsReserve && !p.needsConfirmation).length;
  const housing = input.housingOptions.find(h => h.id === plan?.housingId);
  const moving = input.movingOptions.find(m => m.id === plan?.movingId);
  const recorded = plan?.timeline.filter(row => row.isActual).length ?? 0;
  return <>
    <div className="workspace-intro journey-intro home-guide-intro"><div><h1>What is MoveGap?</h1><p>A moving-money planner for renters in the US. It answers one question: <strong>will I have enough money on every day I need to pay?</strong></p><p>Your rent, deposits, moving costs and paydays go on one timeline. See when money could run short — before you commit to a move.</p></div></div>
    {source === 'example' && <div className="journey-example home-guide-example"><div><strong>Fictional example · try it in 1 minute</strong><p>Explore the filled-in example, or start with your own numbers.</p></div><button className="button secondary" onClick={onStartOwn ?? onEdit}>Start with my own numbers<Icon name="arrow" size={16}/></button></div>}
    <div className="home-guide-heading"><h2>How does it work?</h2><p>Three sections. Here is what to do in each one.</p></div>
    <ol className="journey-steps home-guide-steps" aria-label="Your next steps">
      <li className={ready ? 'is-done' : 'is-next'}>
        <div className="home-guide-copy"><span className="journey-status">{ready ? 'Done' : 'Next'}</span><h3>1. Your move</h3><p>Start here. Open <strong>1. Your move</strong> in the menu and enter the money you have now and the reserve you want to keep.</p><p>Then add your paydays, bills, housing offers and moving costs with their payment dates. When your entries are ready, click <strong>Next: compare plans</strong>.</p>
        <small>{source === 'example' ? 'Example details are filled in. Replace them with your own when ready.' : ready ? 'Your entries are ready to compare. This does not yet mean a plan is affordable.' : 'Complete your entries to generate a comparison.'}</small>
        <button className={`button ${ready ? 'secondary' : 'primary'}`} onClick={onEdit}>{source === 'example' ? 'Review example details' : 'Enter or edit your move'}<Icon name="arrow" size={16}/></button>
        </div><figure className="home-guide-figure"><picture><source media="(max-width: 600px)" srcSet="/guide/enter-your-move-mobile.png"/><img src="/guide/enter-your-move.png" alt="Example of Your starting point: available cash of $4,500 and a reserve of $500. Both fields are highlighted."/></picture><figcaption><Icon name="arrow" size={18}/><span>Begin with these two amounts. Your reserve is the money you want to leave untouched.</span></figcaption></figure>
      </li>
      <li className={selected ? 'is-done' : ready ? 'is-next' : ''}>
        <div className="home-guide-copy"><span className="journey-status">{selected ? 'Done' : ready ? 'Next' : 'Later'}</span><h3>2. Compare plans</h3><p>Open <strong>2. Compare plans</strong>. Each option shows your lowest cash balance and the date it happens.</p><p>Look for <strong>Keeps your reserve</strong>. If money runs short, the plan shows how much is missing and which payments cause it. Review the dates, then click <strong>Choose this plan</strong>.</p>
        <small>In this example, the lowest balance is $1,100. That leaves the $500 reserve intact. Your result depends on your own entries.</small>
        <button className={`button ${!selected && ready ? 'primary' : 'secondary'}`} onClick={onCompare} disabled={!ready}>{selected ? 'Review your choice' : 'Compare plans'}<Icon name="arrow" size={16}/></button>
        </div><figure className="home-guide-figure home-guide-plan"><img src="/guide/compare-your-plan.png" alt="Fictional December 4 plan with a lowest cash balance of $1,100, a Keeps your reserve status, and the Choose this plan button highlighted." width="440" height="767" loading="lazy"/><figcaption><Icon name="arrow" size={18}/><span>Check the lowest balance, then choose the plan you want to follow.</span></figcaption></figure>
      </li>
      <li className={selected ? 'is-next' : ''}>
        <div className="home-guide-copy"><span className="journey-status">{selected ? 'Next' : 'Later'}</span><h3>3. Payment tracker</h3><p>After choosing a plan, open <strong>3. Payment tracker</strong>. This is your payment list for the move.</p><p>When you pay something, click <strong>Record actual</strong> and enter the real amount and date. It replaces the planned payment, so the same bill is not counted twice.</p><small>You can also follow your deposit return and save online to open the plan on another device.</small>
        <button className={`button ${selected ? 'primary' : 'secondary'}`} onClick={onTrack} disabled={!selected}>Open payment tracker<Icon name="arrow" size={16}/></button>
        </div><figure className="home-guide-figure"><picture><source media="(max-width: 600px)" srcSet="/guide/track-your-payments-mobile.png"/><img src="/guide/track-your-payments.png" alt="Example payment list with planned amounts and dates. Record actual opens the form for a payment's real amount and date." loading="lazy"/></picture><figcaption><Icon name="arrow" size={18}/><span>Use Record actual after a payment happens. The timeline updates with what you really paid.</span></figcaption></figure>
      </li>
    </ol>
    <p className="home-guide-caption">Screenshots show fictional example data, not your current plan.</p>
    {plan && <details className="journey-forecast"><summary>{selected ? 'View your selected plan’s forecast' : source === 'example' ? 'Preview the example forecast' : 'Preview your cash forecast'}</summary>
    {!plan ? <div className="empty-state"><Icon name="home" size={32}/><h2>Give your move a starting point.</h2><p>Add your cash, payments and housing and moving options. Your forecast will appear here.</p>{result.errors.length > 0 && <p>{result.errors.length} input {result.errors.length === 1 ? 'item needs' : 'items need'} attention in Move details.</p>}<button className="button primary" onClick={onEdit}>Add move details</button></div> : <>
      <div className="overview-context"><span>{selected ? 'Selected plan' : isEligible(plan) ? 'Best option from your offers' : 'Closest option · none keeps your reserve yet'}</span><strong>{housing?.label} · {moving?.label}</strong><span>Move on {shortDate(plan.moveDate)}</span></div>
      <div className="overview-grid">
        <section className="overview-forecast" aria-label="Cash forecast">
          <div className="overview-verdict"><Icon name={plan.meetsReserve && !plan.needsConfirmation ? 'check' : 'info'} size={22}/><div><h2>{plan.needsConfirmation ? 'These terms still need confirmation.' : plan.gapToZeroCents > 0 ? 'This option leaves a cash shortfall.' : !plan.meetsReserve ? 'This option dips into your reserve.' : 'This option keeps your reserve intact.'}</h2><p>{plan.gapToZeroCents > 0 ? `Cash first falls below zero on ${shortDate(plan.firstBelowZeroDate!)}.` : plan.firstBelowReserveDate ? `Cash first falls below your reserve on ${shortDate(plan.firstBelowReserveDate)}.` : 'Based on the payments you entered for this 60-day window.'}</p></div></div>
          <div className="overview-numbers"><div><span>Lowest cash balance</span><strong className={!plan.meetsReserve ? 'negative' : ''}>{money(plan.minBalanceCents)}</strong><small>{shortDate(plan.minBalanceDate)}</small></div><div><span>Extra cash to keep reserve</span><strong>{money(plan.gapToReserveCents)}</strong><small>Reserve: {money(input.reserveCents)}</small></div></div>
          <CashChart input={input} plan={plan}/>
          <p className="overview-note">Expected deposit returns are excluded. Payments are counted before income on the same day.</p>
        </section>
        <aside className="overview-side">
          <section className="overview-options"><Icon name="home" size={24}/><h2>Your moving options</h2><p><strong>{result.plans.length}</strong> compatible {result.plans.length === 1 ? 'combination' : 'combinations'} from your entered offers.</p><p>{suitable ? `${suitable} confirmed ${suitable === 1 ? 'option keeps' : 'options keep'} your reserve intact.` : 'No confirmed option currently preserves your reserve.'}</p><button className="button primary full-width" onClick={onCompare}>Compare options<Icon name="arrow" size={17}/></button></section>
          <section className="overview-tracking"><Icon name="calendar" size={23}/><h2>{selected ? 'Keep your plan up to date' : 'Keep track after you choose'}</h2><p>{selected ? `${recorded} of ${plan.timeline.length} entries have actual amounts recorded. Update payments and track your old deposit.` : 'Choose an option to track payments, record what happened and save your plan.'}</p><button className="text-button" onClick={selected ? onTrack : onCompare}>{selected ? 'Open payment tracker' : 'Choose an option'}<Icon name="arrow" size={16}/></button></section>
        </aside>
      </div>
      <details className="assumptions"><summary><Icon name="info" size={17}/>Forecast assumptions</summary><p>This is a forecast for the option named above, not a guarantee. Only entered payments within the 60-day window are included. The earliest suitable option is chosen only among your entered offers.</p>{plan.warnings.map((warning,index)=><p key={index}>{warning}</p>)}</details>
    </>}
    </details>}
  </>;
}
