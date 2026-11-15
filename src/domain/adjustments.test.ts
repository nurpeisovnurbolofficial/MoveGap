import { describe, expect, it } from 'vitest';
import { createExample } from './example';
import { calculatePlans } from './engine';
import { getPaymentHistory } from './payments';
import { adjustablePayments, applyAdjustment, findAdjustments, stressAdjustment, type AdjustmentRequest } from './adjustments';

function fixture() {
  const input = createExample(), plan = calculatePlans(input).plans[0];
  const request: AdjustmentRequest = { planId: plan.id, maxChanges: 2, maxFeeCents: 0, windows: [
    { eventId: 'rent-early', earliest: '2026-12-01', latest: '2026-12-04', feeCents: 0, feeDate: '2026-12-01' },
    { eventId: 'truck-early', earliest: '2026-11-25', latest: '2026-12-04', feeCents: 0, feeDate: '2026-11-25' },
  ] };
  return { input, plan, request };
}
describe('Constrained payment changes', () => {
  it('finds the minimum working change set, respecting same-day outflows before payday', () => {
    const { input, request } = fixture(), before = structuredClone(input);
    const result = findAdjustments(input, request), best = result.candidates[0];
    expect(best.changes).toHaveLength(2); expect(best.changes.map(c => c.to)).toEqual(['2026-12-04', '2026-12-04']);
    expect(best.plan.meetsReserve).toBe(true); expect(best.plan.needsConfirmation).toBe(true);
    expect(findAdjustments(input, { ...request, maxChanges: 1 }).candidates.every(c => !c.plan.meetsReserve)).toBe(true);
    expect(input).toEqual(before);
  });
  it('keeps paid facts across alternatives and refuses changing paid or linked obligations', () => {
    const { input, request, plan } = fixture();
    input.housingOptions[1].events[0].actual = { date: '2026-11-20', amountCents: 40000 };
    input.housingOptions[0].events[0].actualLinks = { 'deposit-later': 'same-payment' };
    const candidates = adjustablePayments(input, plan);
    expect(candidates.some(e => e.id === 'deposit-early')).toBe(false);
    const found = findAdjustments(input, request).candidates[0];
    const updated = applyAdjustment(input, found);
    expect(getPaymentHistory(updated).filter(r => r.event.actual)).toEqual(getPaymentHistory(input).filter(r => r.event.actual));
    expect(updated.movingOptions[0].moveDate).toBe(input.movingOptions[0].moveDate);
    expect(() => findAdjustments(input, { ...request, windows: [{ ...request.windows[0], eventId: 'deposit-later' }] })).toThrow();
    const changedEvent = getPaymentHistory(input).find(r => r.event.id === found.changes[0].eventId)!.event;
    changedEvent.actual = { date: changedEvent.date, amountCents: changedEvent.amountCents };
    expect(() => applyAdjustment(input, found)).toThrow();
  });
  it('charges user-entered fees on their due dates and keeps them with the right option', () => {
    const { input, request } = fixture();
    request.windows[0].feeCents = 10000; request.maxFeeCents = 10000;
    const found = findAdjustments(input, request).candidates[0];
    expect(found.plan.meetsReserve).toBe(true); expect(found.feeCents).toBe(10000);
    const updated = applyAdjustment(input, found);
    expect(updated.housingOptions[0].events.at(-1)?.amountCents).toBe(10000);
    expect(updated.housingOptions[1]).toEqual(input.housingOptions[1]);
    expect(updated.commonEvents).toEqual(input.commonEvents);
    const limited = findAdjustments(input, { ...request, maxFeeCents: 0 });
    expect(limited.candidates.every(c => !c.changes.some(change => change.eventId === 'rent-early'))).toBe(true);
  });
  it('does not hide expenses outside the forecast or invent an improvement', () => {
    const { input, request } = fixture();
    expect(() => findAdjustments(input, { ...request, windows: [{ ...request.windows[0], latest: '2027-02-01' }] })).toThrow();
    expect(() => findAdjustments(input, { ...request, windows: [{ ...request.windows[0], earliest: '2026-12-10', latest: '2026-12-01' }] })).toThrow();
    expect(() => findAdjustments(input, { ...request, maxFeeCents: NaN })).toThrow();
    const unchanged = findAdjustments(input, { ...request, windows: request.windows.map(w => ({ ...w, latest: w.earliest })) });
    expect(unchanged.candidates).toEqual([]);
    const alreadyFits = findAdjustments({ ...input, openingCashCents: 900000 }, request);
    expect(alreadyFits.candidates).toEqual([]);
  });
  it('tests combined shocks without mutating the candidate or relying on expected refunds', () => {
    const { input, request } = fixture(), before = structuredClone(input);
    const found = findAdjustments(input, request).candidates[0];
    const stressed = stressAdjustment(input, found, 'payday', 7, 20000, '2026-12-02');
    expect(stressed.meetsReserve).toBe(false);
    expect(stressed.timeline.some(r => r.eventId === 'refund')).toBe(false);
    expect(stressed.costCents).toBe(found.plan.costCents + 20000);
    expect(input).toEqual(before); expect(found.plan.meetsReserve).toBe(true);
    expect(() => stressAdjustment(input, found, 'old-rent', 3, 0, input.startDate)).toThrow();
    expect(() => stressAdjustment(input, found, '', 0, 20000, '2027-04-01')).toThrow();
  });
});
