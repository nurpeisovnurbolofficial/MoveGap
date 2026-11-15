import type { ComparisonResult, MoveInput, PlanResult } from '../../domain/types';
import { CashChart } from '../../components/CashChart';
import { Icon } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { closestPlan, highlights, isEligible } from '../compare-plans/planInsights';
import './OverviewPage.css';

export function OverviewPage({ input, result, selected, source, onEdit, onCompare, onTrack }: {
  input: MoveInput; result: ComparisonResult; selected?: PlanResult; source: 'example' | 'own' | 'saved';
  onEdit: () => void; onCompare: () => void; onTrack: () => void;
}) {
  // Lead with the answer: the engine's best confirmed plan, else the one closest to working.
  const summary = highlights(result);
  const best = result.plans.find(p => p.id === (summary.bestFitId ?? result.largestBufferPlanId)) ?? (result.plans.length ? closestPlan(result) : undefined);
  const plan = selected ?? best;
  const suitable = result.plans.filter(p => p.meetsReserve && !p.needsConfirmation).length;
  const housing = input.housingOptions.find(h => h.id === plan?.housingId);
  const moving = input.movingOptions.find(m => m.id === plan?.movingId);
  const recorded = plan?.timeline.filter(row => row.isActual).length ?? 0;
  return <>
    <div className="workspace-intro"><div><h1>Can you pay for your move on every payment day?</h1><p>MoveGap puts your cash, rent, deposit, mover and paydays on one calendar and shows the day money runs short — before you sign anything.</p></div></div>
    <ol className="overview-steps" aria-label="How MoveGap works">
      <li className={result.errors.length ? 'is-next' : 'is-done'}><button onClick={onEdit}><span className="overview-step-number">1</span><span><strong>Enter your move</strong><small>Your cash, paydays, bills, and the homes and movers you are choosing between.</small></span><em>{result.errors.length ? 'To do' : 'Done'}</em></button></li>
      <li className={selected ? 'is-done' : result.errors.length ? '' : 'is-next'}><button onClick={onCompare}><span className="overview-step-number">2</span><span><strong>Compare plans</strong><small>See which home and moving date keeps enough cash on every day.</small></span><em>{selected ? 'Done' : 'Next'}</em></button></li>
      <li className={selected ? 'is-next' : ''}><button onClick={selected ? onTrack : onCompare}><span className="overview-step-number">3</span><span><strong>Track payments</strong><small>Record what you really pay and get a reminder before each due date.</small></span><em>{selected ? 'Next' : 'Later'}</em></button></li>
    </ol>
    {source === 'example' && <div className="workspace-example-note"><span>This is a fictional example, so you can try every step right away.</span><button className="text-button" onClick={onEdit}>Use my own numbers<Icon name="arrow" size={16}/></button></div>}
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
  </>;
}
