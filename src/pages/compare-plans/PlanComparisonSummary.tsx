import type { ComparisonResult, MoveInput, PlanResult } from '../../domain/types';
import { money, shortDate } from '../../shared/format';
import { isEligible, planOptions } from './planInsights';
import './PlanComparisonSummary.css';

/** Prefer engine picks; never manufacture a comparison against the same plan. */
export function comparisonPair(result: ComparisonResult, currentPlanId: string | null) {
  const selected = result.plans.find(plan => plan.id === currentPlanId);
  const baseline = selected ?? result.plans[0];
  const alternative = [result.earliestPlanId, result.cheapestPlanId, result.largestBufferPlanId]
    .map(id => result.plans.find(plan => plan.id === id))
    .find((plan): plan is PlanResult => !!plan && plan.id !== baseline?.id && isEligible(plan));
  return {baseline, alternative, isCurrent:!!selected};
}

function CashOutcome({ plan, reserve }: {plan: PlanResult; reserve:number}) {
  const first = plan.timeline.find(row => row.date === plan.firstBelowZeroDate && row.balanceCents < 0);
  return <>
    {plan.firstBelowZeroDate ? <>
      <p>First below $0: <strong>{shortDate(plan.firstBelowZeroDate)}</strong>{first && <>, after {first.label}{-first.balanceCents !== plan.gapToZeroCents && <> ({money(-first.balanceCents)} short at that point)</>}</>}.</p>
      <p>Extra cash to cover every payment over 60 days: <strong>{money(plan.gapToZeroCents)}</strong>. To also keep your {money(reserve)} reserve: <strong>{money(plan.gapToReserveCents)}</strong>.</p>
    </> : plan.meetsReserve ? <p>Keeps your <strong>{money(reserve)} reserve</strong> throughout the 60-day plan.</p>
      : <p>Every payment is covered, but cash falls below your reserve{plan.firstBelowReserveDate && <> on {shortDate(plan.firstBelowReserveDate)}</>}. You need <strong>{money(plan.gapToReserveCents)} more</strong> to keep your {money(reserve)} reserve.</p>}
    {plan.needsConfirmation && <p className="comparison-conditional"><strong>Terms still need confirmation.</strong> These amounts assume the proposed terms; this is not a confirmed recommendation.</p>}
  </>;
}

export function PlanComparisonSummary({input,result,currentPlanId=null}:{input:MoveInput;result:ComparisonResult;currentPlanId?:string|null}) {
  if(result.errors.length || !result.plans.length) return null;
  const {baseline,alternative,isCurrent}=comparisonPair(result,currentPlanId);
  const eligible=result.plans.filter(isEligible).length;
  const number=(plan:PlanResult)=>result.plans.indexOf(plan)+1;
  const names=(plan:PlanResult)=>{const {housing,moving}=planOptions(plan,input);return `${housing?.label ?? 'Housing'} · ${moving?.label ?? 'Moving'}`;};
  const spendingDifference=alternative ? alternative.costCents-baseline.costCents : 0;
  const balanceDifference=alternative ? alternative.minBalanceCents-baseline.minBalanceCents : 0;
  return <section className="plan-comparison-summary" aria-labelledby="plan-comparison-title">
    <h2 id="plan-comparison-title">What changes between plans?</h2>
    {!eligible && <p className="comparison-no-fit"><strong>No confirmed plan keeps your reserve.</strong> A plan with unconfirmed terms is not a safe alternative yet.</p>}
    <div className={`comparison-pair${alternative?' has-alternative':''}`}>
      <div><h3>{isCurrent?'Your current plan':'First entered plan'} · Plan {number(baseline)}</h3><p className="comparison-pair-name">{names(baseline)} · Move {shortDate(baseline.moveDate)}</p><CashOutcome plan={baseline} reserve={input.reserveCents}/></div>
      {alternative && <div><h3>Confirmed alternative · Plan {number(alternative)}</h3><p className="comparison-pair-name">{names(alternative)} · Move {shortDate(alternative.moveDate)}</p><CashOutcome plan={alternative} reserve={input.reserveCents}/></div>}
    </div>
    {alternative ? <p className="comparison-tradeoff"><strong>Plan {number(alternative)} compared with Plan {number(baseline)}:</strong> {spendingDifference === 0 ? 'the same spending' : `${money(Math.abs(spendingDifference))} ${spendingDifference>0?'more':'less'} spending`} (excluding refundable deposits). {balanceDifference===0?'Their lowest cash balances are equal.':`Its lowest cash balance is ${money(Math.abs(balanceDifference))} ${balanceDifference>0?'higher':'lower'}.`}</p>
      : eligible>0 && <p className="comparison-tradeoff">{result.plans.length===1?'This is the only compatible plan.':'The engine’s highlighted choices do not give a different confirmed plan to compare here. Review the other cards for their terms.'}</p>}
  </section>;
}
