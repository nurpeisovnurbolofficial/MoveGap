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
    <div className="workspace-intro"><div><h1>Your move at a glance.</h1><p>Know where your cash stands before you commit.</p></div><button className="button secondary" onClick={onEdit}><Icon name="wallet" size={18}/>Edit move details</button></div>
    {source === 'example' && <div className="workspace-example-note overview-tryit">
      <div><strong>Fictional example · try it in 1 minute</strong>
        <ol><li>Open <b>Compare options</b> to see which plan works and why.</li><li>Under <b>What if something changes?</b>, test a late paycheck.</li><li>Choose a plan, then <b>record an actual payment</b> in Payment tracker.</li></ol></div>
      <div className="overview-tryit-actions"><button className="button primary" onClick={onCompare}>Start: Compare options<Icon name="arrow" size={16}/></button><button className="text-button" onClick={onEdit}>Use my own numbers<Icon name="arrow" size={16}/></button></div>
    </div>}
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
