import { describe, expect, it } from 'vitest';
import { calculatePlans, addDays } from '../../domain/engine';
import { createExample } from '../../domain/example';
import { calendarDays, delayIncome, delayableIncome, paymentRequest } from './explorationData';

describe('Income delay scenario', () => {
  it('uses the shared engine and verifies the delayed-paycheck demo without editing the original', () => {
    const input = createExample(); const original = structuredClone(input);
    const delayed = delayIncome(input, 'payday', 2);
    const baseline = calculatePlans(input); const result = calculatePlans(delayed);
    expect(input).toEqual(original);
    expect(delayed.commonEvents.find(e => e.id === 'payday')?.date).toBe('2026-12-05');
    expect(baseline.plans.filter(p => p.meetsReserve)).toHaveLength(1);
    expect(result.plans.filter(p => p.meetsReserve)).toHaveLength(0);
    expect(result.plans[2].minBalanceCents).toBe(-115000);
    expect(result.plans[2].minBalanceDate).toBe('2026-12-04');
    expect(result.plans[2].costCents).toBe(baseline.plans[2].costCents);
  });
  it('does not delay income already received or proposed income', () => {
    const input = createExample(); const payday = input.commonEvents.find(e => e.id === 'payday')!;
    payday.actual = { date: payday.date, amountCents: payday.amountCents };
    expect(delayIncome(input, 'payday', 7)).toEqual(input);
    expect(delayableIncome(input, calculatePlans(input).horizonEnd)).toHaveLength(0);
    delete payday.actual; payday.confirmation = 'proposed';
    expect(delayIncome(input, 'payday', 2)).toEqual(input);
  });
  it('supports income inside an option and warns when the shifted income leaves the horizon', () => {
    const input = createExample(); const income = input.commonEvents.find(e => e.id === 'payday')!;
    input.commonEvents = input.commonEvents.filter(e => e.id !== income.id);
    income.date = addDays(input.startDate, 59); input.housingOptions[0].events.push(income);
    const delayed = delayIncome(input, income.id, 2);
    expect(input.housingOptions[0].events.at(-1)?.date).toBe(addDays(input.startDate, 59));
    expect(calculatePlans(delayed).plans[0].warnings.some(w => w.includes('outside the 60-day window'))).toBe(true);
  });
});

describe('Cash calendar reads engine balances', () => {
  it('produces exactly 60 unique real dates and carries balances on days without events', () => {
    const input = createExample(); const plan = calculatePlans(input).plans[2]; const days = calendarDays(input, plan);
    expect(days).toHaveLength(60); expect(new Set(days.map(d => d.date)).size).toBe(60);
    expect(days[0].date).toBe(input.startDate); expect(days[59].date).toBe(addDays(input.startDate, 59));
    expect(days.at(-1)?.closing).toBe(plan.endingBalanceCents);
    expect(Math.min(...days.map(d => d.low))).toBe(plan.minBalanceCents);
    expect(days.find(d => d.date === '2026-11-21')?.closing).toBe(280000);
  });
  it('retains a same-day shortfall even when income restores the closing balance', () => {
    const input = createExample(); input.commonEvents.find(e => e.id === 'payday')!.date = '2026-12-01';
    const plan = calculatePlans(input).plans[0]; const day = calendarDays(input, plan).find(d => d.date === '2026-12-01')!;
    expect(day.low).toBe(-115000); expect(day.closing).toBe(125000);
    expect(day.rows.at(-1)?.kind).toBe('income');
  });
  it('uses actual dates and handles zero cash and an empty timeline without fictitious events', () => {
    const input = createExample(); input.openingCashCents = 0; input.reserveCents = 0;
    input.commonEvents = [];
    for (const option of [...input.housingOptions, ...input.movingOptions]) {
      option.events.forEach(event => { event.amountCents = 0; event.date = addDays(input.startDate, -1); });
    }
    const plan = calculatePlans(input).plans[0];
    expect(calendarDays(input, plan).every(d => d.low === 0 && d.rows.length === 0)).toBe(true);
    input.commonEvents.push({ id: 'actual-income', label: 'Actual pay', kind: 'income', date: input.startDate, amountCents: 100, confirmation: 'confirmed', actual: {date: addDays(input.startDate, 2), amountCents: 200} });
    const days = calendarDays(input, calculatePlans(input).plans[0]);
    expect(days[0].rows).toHaveLength(0); expect(days[2].closing).toBe(200); expect(days[3].low).toBe(200);
  });
});

describe('Possible payment-date request', () => {
  it('checks the request with the engine, keeps it conditional, and never changes the input', () => {
    const input = createExample(); const original = structuredClone(input); const plan = calculatePlans(input).plans[0];
    const request = paymentRequest(input, plan)!;
    expect(request).not.toBeNull(); expect(input).toEqual(original);
    expect(request.event.id).toBe('deposit-early'); expect(request.toDate).toBe('2026-12-04');
    expect(request.after.minBalanceCents).toBe(45000); expect(request.after.meetsReserve).toBe(false);
    expect(request.after.gapToReserveCents).toBe(5000); expect(request.after.needsConfirmation).toBe(true);
    expect(request.after.costCents).toBe(plan.costCents);
  });
  it('does not suggest moving actual payments or dates beyond the horizon', () => {
    const input = createExample(); input.housingOptions[0].events.forEach(e => { e.actual = { date:e.date, amountCents:e.amountCents }; });
    expect(paymentRequest(input, calculatePlans(input).plans[0])).toBeNull();
    const late = createExample(); late.commonEvents.find(e => e.id === 'payday')!.date = addDays(late.startDate, 59);
    expect(paymentRequest(late, calculatePlans(late).plans[0])).toBeNull();
  });
  it('does not invent a request for a plan that fits or when no later income exists', () => {
    const input = createExample(); expect(paymentRequest(input, calculatePlans(input).plans[2])).toBeNull();
    input.commonEvents = input.commonEvents.filter(e => e.kind !== 'income');
    expect(paymentRequest(input, calculatePlans(input).plans[0])).toBeNull();
  });
});
