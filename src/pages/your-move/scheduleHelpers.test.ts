import { describe, expect, it } from 'vitest';
import { createExample } from '../../domain/example';
import { calculatePlans } from '../../domain/engine';
import { getPaymentHistory } from '../../domain/payments';
import { addSeries, copyOption, seriesPreview, type SeriesDraft } from './scheduleHelpers';

const draft: SeriesDraft = { label: 'Paycheck', amountCents: 240000, firstDate: '2026-11-14', lastDate: '2026-12-26', frequency: 'biweekly', kind: 'income', confirmed: true };
describe('Repeating payments', () => {
  it('previews and adds exact dates once, without altering actuals or other options', () => {
    const input = createExample(); input.commonEvents[0].actual = { date: '2026-11-17', amountCents: 9000 };
    const before = structuredClone(input), preview = seriesPreview(input, draft);
    expect(preview.rows.map(r => r.date)).toEqual(['2026-11-14', '2026-11-28', '2026-12-12', '2026-12-26']);
    const added = addSeries(input, draft), repeated = addSeries(added, draft);
    expect(added.commonEvents).toHaveLength(input.commonEvents.length + 4);
    expect(repeated).toEqual(added); expect(input).toEqual(before);
    expect(getPaymentHistory(added).filter(r => r.event.actual)).toHaveLength(1);
    expect(calculatePlans(added).errors).toEqual([]);
  });
  it('restores the original monthly day after a short month', () => {
    const input = { ...createExample(), startDate: '2027-01-31' };
    const result = seriesPreview(input, { ...draft, firstDate: '2027-01-31', lastDate: '2027-03-31', frequency: 'monthly' });
    expect(result.rows.map(r => r.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
  it('keeps unconfirmed income excluded and creates independent unique events', () => {
    const input = createExample(), next = addSeries(input, { ...draft, confirmed: false });
    expect(calculatePlans(next).plans.map(p => p.minBalanceCents)).toEqual(calculatePlans(input).plans.map(p => p.minBalanceCents));
    expect(new Set(next.commonEvents.map(e => e.id)).size).toBe(next.commonEvents.length);
  });
  it('rejects invalid, reversed or out-of-window dates, invalid money and capacity overflow', () => {
    for (const patch of [{ firstDate: '2026-02-30' }, { lastDate: '2026-11-01' }, { lastDate: '2027-06-01' }, { amountCents: NaN }, { amountCents: -100 }])
      expect(() => seriesPreview(createExample(), { ...draft, ...patch })).toThrow();
    const full = createExample(); full.commonEvents = Array.from({ length: 294 }, (_, i) => ({ ...full.commonEvents[0], id: `full-${i}` }));
    expect(() => addSeries(full, draft)).toThrow('300-payment');
  });
});
describe('Alternative copy', () => {
  it('preserves original actuals without duplicating them or silently confirming the copy', () => {
    const input = createExample(); input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 90000 };
    const before = structuredClone(input), next = copyOption(input, 'moving', input.movingOptions[0].id);
    const copy = next.movingOptions[2];
    expect(copy.confirmation).toBe('proposed'); expect(copy.events[0].actual).toBeUndefined();
    expect(copy.events[0].id).not.toBe(input.movingOptions[0].events[0].id);
    expect(input).toEqual(before); expect(getPaymentHistory(next).filter(r => r.event.actual)).toHaveLength(1);
    expect(calculatePlans(next).errors).toEqual([]);
    expect(calculatePlans(next).plans.filter(p => p.movingId === copy.id).every(p => p.needsConfirmation)).toBe(true);
    expect(() => copyOption(next, 'moving', copy.id)).toThrow('three options');
  });
});
