import { describe, expect, it } from 'vitest';
import { calculatePlans } from './engine';
import { createExample } from './example';

describe('cash decisions from independent expected amounts', () => {
  it('matches both reference schedules, rejects an unavailable home, and excludes the expected refund', () => {
    const r = calculatePlans(createExample());
    expect(r.errors).toEqual([]);
    const early = r.plans.find(p => p.housingId === 'home-early' && p.movingId === 'mover-early')!;
    const later = r.plans.find(p => p.housingId === 'home-later' && p.movingId === 'mover-later')!;
    expect(early.minBalanceCents).toBe(-115000);
    expect(early.gapToZeroCents).toBe(115000);
    expect(early.gapToReserveCents).toBe(165000);
    expect(later.minBalanceCents).toBe(110000);
    expect(later.costCents).toBe(405000);
    expect(later.depositOutflowCents).toBe(160000);
    expect(later.endingBalanceCents).toBe(125000);
    expect(r.earliestPlanId).toBe(later.id);
    expect(r.rejected).toHaveLength(1);
  });
  it('captures an intraday shortfall even when payday covers it that evening', () => {
    const input = createExample();
    input.commonEvents.find(e => e.id === 'payday')!.date = '2026-12-01';
    const p = calculatePlans(input).plans[0];
    expect(p.minBalanceCents).toBe(-115000);
    expect(p.timeline.filter(e => e.date === '2026-12-01').at(-1)!.balanceCents).toBe(125000);
  });
  it('updates actual expense in place and keeps its planned amount', () => {
    const input = createExample();
    input.commonEvents[0].actual = { date: '2026-11-18', amountCents: 12500 };
    const p = calculatePlans(input).plans[0];
    expect(p.minBalanceCents).toBe(-117500);
    expect(p.timeline.filter(e => e.eventId === 'application')).toHaveLength(1);
    expect(p.timeline[0].plannedAmountCents).toBe(10000);
  });
  it('includes only the amount of a deposit actually received', () => {
    const input = createExample();
    input.commonEvents.find(e => e.id === 'refund')!.actual = { date: '2026-12-20', amountCents: 50000 };
    const p = calculatePlans(input).plans[0];
    expect(p.endingBalanceCents).toBe(175000);
    expect(p.costCents).toBe(405000);
  });
  it('does not recommend hypothetical agreements', () => {
    const input = createExample();
    input.housingOptions[1].confirmation = 'proposed';
    expect(calculatePlans(input).earliestPlanId).toBeNull();
  });
  it('does not create a deficit when sufficient cash is provided', () => {
    const input = createExample(); input.openingCashCents = 1_000_000;
    expect(calculatePlans(input).plans.every(p => p.gapToReserveCents === 0)).toBe(true);
  });
  it('supports a zero deposit and cents without rounding the balance', () => {
    const input = createExample();
    input.housingOptions[0].events[0].amountCents = 0;
    input.commonEvents[0].amountCents = 10001;
    const p = calculatePlans(input).plans[0];
    expect(p.minBalanceCents).toBe(44999);
    expect(p.gapToReserveCents).toBe(5001);
  });
  it('reports invalid dates, negative amounts and duplicate event IDs', () => {
    const input = createExample();
    input.commonEvents[0].date = '2026-02-30';
    input.commonEvents[0].amountCents = -10;
    input.commonEvents[1].id = input.commonEvents[0].id;
    const r = calculatePlans(input);
    expect(r.errors.length).toBeGreaterThan(0); expect(r.plans).toEqual([]);
  });
  it('does not debit events already reflected in opening cash', () => {
    const input = createExample(); input.commonEvents[0].date = '2026-11-13';
    expect(calculatePlans(input).plans[0].minBalanceCents).toBe(-105000);
  });
  it('flags outside-window obligations instead of silently including them', () => {
    const input = createExample(); input.commonEvents[0].date = '2027-03-01';
    expect(calculatePlans(input).plans[0].warnings.some(w => w.includes('outside'))).toBe(true);
  });
});
