import { describe, expect, it } from 'vitest';
import { calculatePlans } from './engine';
import { createExample } from './example';
import type { MoveInput } from './types';
import { getPaymentHistory, paymentRemovalReason } from './payments';
import { removeOption, removePayment } from '../pages/your-move/inputHelpers';
import { parseSnapshot } from '../state/storage';

const later = (input: MoveInput) => calculatePlans(input).plans.find(p => p.housingId === 'home-later' && p.movingId === 'mover-later')!;

describe('actual payments across alternative plans', () => {
  it('keeps $900 paid to the old mover in the alternative with a separate $700 service', () => {
    const input = createExample();
    input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 90000 };
    const plan = later(input);
    expect(plan.endingBalanceCents).toBe(35000);
    expect(plan.costCents).toBe(495000);
    expect(plan.timeline.filter(row => row.eventId === 'truck-early')).toHaveLength(1);
    expect(plan.timeline.filter(row => row.eventId === 'truck-later')).toHaveLength(1);
  });

  it('does not count the selected option actual twice or mutate the input', () => {
    const input = createExample();
    input.movingOptions[1].events[0].actual = { date: '2026-12-04', amountCents: 90000 };
    const before = JSON.stringify(input);
    expect(later(input).endingBalanceCents).toBe(105000);
    expect(later(input).timeline.filter(row => row.eventId === 'truck-later')).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps an actual housing deposit separate from nonrefundable costs', () => {
    const input = createExample();
    input.housingOptions[0].events[0].actual = { date: '2026-11-20', amountCents: 160000 };
    expect(later(input).endingBalanceCents).toBe(-35000);
    expect(later(input).depositOutflowCents).toBe(320000);
    expect(later(input).costCents).toBe(405000);
  });

  it('does not invent a refund when another option is selected', () => {
    const input = createExample();
    input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 90000 };
    input.commonEvents.push({ id: 'mover-refund', label: 'Mover refund', date: '2026-12-05', amountCents: 90000, kind: 'income', confirmation: 'proposed' });
    expect(later(input).endingBalanceCents).toBe(35000);
    input.commonEvents.at(-1)!.actual = { date: '2026-12-05', amountCents: 90000 };
    expect(later(input).endingBalanceCents).toBe(125000);
    expect(later(input).timeline.filter(row => row.eventId === 'mover-refund')).toHaveLength(1);
  });

  it('requires review of possible overlap even with enough cash; labels do not identify obligations', () => {
    const input = createExample(); input.openingCashCents = 1000000;
    input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 90000 };
    expect(later(input).needsConfirmation).toBe(true);
    expect(calculatePlans(input).cheapestPlanId).not.toBe(later(input).id);
    input.movingOptions[1].events[0].actualLinks = { 'truck-early': 'separate-payment' };
    expect(later(input).needsConfirmation).toBe(false);
    expect(later(input).endingBalanceCents).toBe(585000);
  });

  it('uses the explicitly linked actual once, preserving its amount and original planned values', () => {
    const input = createExample();
    input.housingOptions[0].events[0].actual = { date: '2026-11-21', amountCents: 150000 };
    input.housingOptions[1].events[0].actualLinks = { 'deposit-early': 'same-payment' };
    const plan = later(input);
    expect(plan.endingBalanceCents).toBe(135000);
    expect(plan.depositOutflowCents).toBe(150000);
    expect(plan.needsConfirmation).toBe(false);
    expect(plan.timeline.some(row => row.eventId === 'deposit-later')).toBe(false);
    expect(plan.timeline.find(row => row.eventId === 'deposit-early')).toMatchObject({ effectiveAmountCents: 150000, plannedAmountCents: 160000, date: '2026-11-21', plannedDate: '2026-11-20' });
  });

  it('does not debit a linked actual already reflected in opening cash', () => {
    const input = createExample();
    input.housingOptions[0].events[0].actual = { date: '2026-11-13', amountCents: 160000 };
    input.housingOptions[1].events[0].actualLinks = { 'deposit-early': 'same-payment' };
    expect(later(input).endingBalanceCents).toBe(285000);
    expect(later(input).depositOutflowCents).toBe(0);
    expect(getPaymentHistory(input).find(row => row.event.id === 'deposit-early')?.exclusion).toBe('before-start');
  });

  it('keeps out-of-window actuals in the complete history without charging them inside the forecast', () => {
    const input = createExample();
    input.movingOptions[0].events[0].actual = { date: '2027-02-01', amountCents: 90000 };
    expect(later(input).endingBalanceCents).toBe(125000);
    expect(later(input).warnings.some(w => w.includes('outside'))).toBe(true);
    expect(getPaymentHistory(input).find(row => row.event.id === 'truck-early')).toMatchObject({ owner: { kind: 'moving', id: 'mover-early' }, effectiveDate: '2027-02-01', exclusion: 'after-window' });
  });

  it('restores the future charge and requests review when a linked actual is cleared', () => {
    const input = createExample();
    input.housingOptions[0].events[0].actual = { date: '2026-11-20', amountCents: 160000 };
    input.housingOptions[1].events[0].actualLinks = { 'deposit-early': 'same-payment' };
    input.housingOptions[0].events[0].actual = undefined;
    expect(later(input).endingBalanceCents).toBe(125000);
    expect(later(input).needsConfirmation).toBe(true);
    expect(later(input).timeline.filter(row => row.eventId === 'deposit-later')).toHaveLength(1);
  });

  it('accepts a real zero-dollar payment and counts its explicitly linked obligation once', () => {
    const input = createExample();
    input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 0 };
    input.movingOptions[1].events[0].actualLinks = { 'truck-early': 'same-payment' };
    expect(later(input).endingBalanceCents).toBe(195000);
    expect(later(input).timeline.filter(row => row.eventId === 'truck-early')).toHaveLength(1);
  });

  it('keeps cross-option actual outflows before same-day income when finding the minimum', () => {
    const input = createExample();
    input.movingOptions[0].events[0].actual = { date: '2026-12-03', amountCents: 200000 };
    const plan = later(input);
    expect(plan.minBalanceCents).toBe(-90000);
    expect(plan.timeline.filter(row => row.date === '2026-12-03').map(row => row.eventId)).toEqual(['truck-early', 'payday']);
  });

  it('restores old v1 inputs and persists optional payment relationships without a storage migration', () => {
    const input = createExample();
    const snapshot = () => JSON.stringify({ input, selectedId: later(input).id, savedAt: '2026-11-15T00:00:00Z' });
    expect(later(parseSnapshot(snapshot()).input).endingBalanceCents).toBe(125000);
    input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 90000 };
    input.movingOptions[1].events[0].actualLinks = { 'truck-early': 'separate-payment' };
    expect(later(parseSnapshot(snapshot()).input).endingBalanceCents).toBe(35000);
  });

  it.each([null, [], 'bad', { missing: 'same-payment' }, { 'truck-later': 'same-payment' }, { 'deposit-early': 'same-payment' }, { 'truck-early': 'bad' }])('rejects invalid persisted relationships without executing a forecast: %j', actualLinks => {
    const input = createExample();
    Object.assign(input.movingOptions[1].events[0], { actualLinks });
    const result = calculatePlans(input);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.plans).toEqual([]);
  });

  it('rejects two actual records claimed to be the same payment rather than silently discarding money', () => {
    const input = createExample();
    input.movingOptions.forEach(m => { m.events[0].actual = { date: '2026-11-25', amountCents: 90000 }; });
    input.movingOptions[1].events[0].actualLinks = { 'truck-early': 'same-payment' };
    expect(calculatePlans(input).errors.join(' ')).toContain('two actual records');
  });

  it('blocks deletion of paid entries and their options; ordinary unpaid entries remain removable', () => {
    const input = createExample();
    input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 90000 };
    expect(removeOption(input, { kind: 'moving', id: 'mover-early' })).toBe(input);
    expect(removePayment(input, { kind: 'moving', id: 'mover-early' }, 'truck-early')).toBe(input);
    expect(removeOption(input, { kind: 'moving', id: 'mover-later' }).movingOptions).toHaveLength(1);
    expect(removePayment(input, { kind: 'common' }, 'application').commonEvents).toHaveLength(3);
  });

  it('prevents dangling relationships when removing an entry after clearing its actual', () => {
    const input = createExample();
    input.movingOptions[1].events[0].actualLinks = { 'truck-early': 'same-payment' };
    expect(paymentRemovalReason(input, ['truck-early'])).toContain('refers to this entry');
    expect(removeOption(input, { kind: 'moving', id: 'mover-early' })).toBe(input);
  });
});
