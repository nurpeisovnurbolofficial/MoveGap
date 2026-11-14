import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePlans } from '../../domain/engine';
import { createExample } from '../../domain/example';
import type { MoveInput } from '../../domain/types';
import { comparisonPair, PlanComparisonSummary } from './PlanComparisonSummary';
const text=(html:string)=>html.replace(/<[^>]+>/g,'').replace(/&#x27;/g,"'");
const render=(input:MoveInput,currentPlanId:string|null=null)=>text(renderToStaticMarkup(<PlanComparisonSummary input={input} result={calculatePlans(input)} currentPlanId={currentPlanId}/>));

describe('Explicit plan tradeoff summary',()=>{
  it('compares the first entered plan with an engine-recommended confirmed alternative without claiming a user choice',()=>{
    const input=createExample(); const result=calculatePlans(input); const pair=comparisonPair(result,null);
    expect(pair.baseline.id).toBe(result.plans[0].id);expect(pair.alternative?.id).toBe(result.earliestPlanId);expect(pair.isCurrent).toBe(false);
    const t=render(input);expect(t).toContain('First entered plan · Plan 1');expect(t).toContain('Confirmed alternative · Plan 3');expect(t).toContain('the same spending');expect(t).not.toContain('Your current plan');
  });
  it('uses the actual selected plan and never compares a winner against itself',()=>{
    const input=createExample();const result=calculatePlans(input);
    const pair=comparisonPair(result,result.plans[2].id);expect(pair.alternative).toBeUndefined();
    const t=render(input,result.plans[2].id);expect(t).toContain('Your current plan · Plan 3');expect(t).not.toContain('Confirmed alternative');
    expect(comparisonPair(result,'removed-plan').isCurrent).toBe(false);
  });
  it('keeps the first-shortfall date and amount separate from a worse minimum on a later day',()=>{
    const input=createExample();input.commonEvents.push({id:'later-bill',label:'Later bill',date:'2027-01-01',amountCents:300000,kind:'expense',confirmation:'confirmed'});
    const t=render(input);expect(t).toContain('First below $0: Dec 1, after New rent ($1,150 short at that point)');expect(t).toContain('Extra cash to cover every payment over 60 days: $1,750');expect(t).toContain('reserve: $2,250');
  });
  it('distinguishes the first shortfall and minimum even within the same day',()=>{
    const input=createExample();input.openingCashCents=400000;
    const t=render(input);expect(t).toContain('after Old rent ($100 short at that point)');expect(t).toContain('over 60 days: $1,650');
  });
  it('explains spending and cash tradeoffs when all plans fit',()=>{
    const input=createExample();input.openingCashCents=700000;const t=render(input);
    expect(t).toContain('Confirmed alternative · Plan 3');expect(t).toContain('the same spending');expect(t).toContain('$2,250 higher');expect(t).not.toContain('First below $0');
    input.movingOptions[1].events[0].amountCents=90000;expect(render(input)).toContain('$200 more spending');
  });
  it('does not confuse a larger refundable deposit with a higher spending amount',()=>{
    const input=createExample();input.housingOptions[1].events[0].amountCents=180000;
    expect(render(input)).toContain('the same spending (excluding refundable deposits)');
  });
  it('does not recommend unconfirmed options when none qualify',()=>{
    const input=createExample();input.housingOptions.forEach(h=>{h.confirmation='proposed';});const t=render(input);
    expect(t).toContain('No confirmed plan keeps your reserve.');expect(t).toContain('Terms still need confirmation.');expect(t).not.toContain('Confirmed alternative');
  });
  it('handles no, one and nine compatible plans without fictitious comparisons',()=>{
    const input=createExample();input.latestMoveDate='2026-11-24';expect(render(input)).toBe('');
    input.latestMoveDate='2026-12-04';input.housingOptions=[input.housingOptions[1]];input.movingOptions=[input.movingOptions[1]];
    expect(render(input)).toContain('This is the only compatible plan.');
    const nine=createExample();nine.housingOptions.forEach(h=>{h.availableFrom=nine.startDate;});
    nine.housingOptions.push({...structuredClone(nine.housingOptions[0]),id:'home-third',events:nine.housingOptions[0].events.map(e=>({...e,id:e.id+'-third'}))});
    nine.movingOptions.push({...structuredClone(nine.movingOptions[1]),id:'move-third',events:nine.movingOptions[1].events.map(e=>({...e,id:e.id+'-third'}))});
    expect(calculatePlans(nine).plans).toHaveLength(9);expect(render(nine)).toContain('First entered plan');
    nine.openingCashCents=NaN;expect(render(nine)).toBe('');
  });
  it('updates its dates and gap when inputs change',()=>{
    const input=createExample();const initial=render(input);input.openingCashCents=800000;expect(render(input)).not.toBe(initial);expect(render(input)).not.toContain('First below $0');
    input.openingCashCents=450000;input.commonEvents.find(e=>e.id==='payday')!.date='2026-11-30';expect(render(input)).not.toContain('First below $0');
  });
});
