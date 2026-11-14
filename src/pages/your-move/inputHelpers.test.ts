import { describe, expect, it } from 'vitest';
import { calculatePlans } from '../../domain/engine';
import { createExample } from '../../domain/example';
import type { PaymentEvent } from '../../domain/types';
import { createOwnMove, paymentTimingNote, putPayment, removePayment } from './inputHelpers';

describe('personal move input and payment ownership', () => {
  it('starts without example money or commitments and cannot produce a false free plan', () => {
    const input = createOwnMove('2026-11-15');
    expect(input.commonEvents).toEqual([]);
    expect(input.housingOptions).toEqual([]);
    expect(input.movingOptions).toEqual([]);
    expect(calculatePlans(input).plans).toEqual([]);
  });

  it('calculates a new user scenario, edits a housing payment only in its own option and removes it', () => {
    let input = createOwnMove('2026-11-15');
    input.openingCashCents = 400000;
    input.reserveCents = 50000;
    input.housingOptions = [{ id: 'home', label: 'My lease', availableFrom: '2026-12-01', confirmation: 'confirmed', events: [] }];
    input.movingOptions = [{ id: 'van', label: 'Van', moveDate: '2026-12-02', confirmation: 'confirmed', events: [] }];
    const rent: PaymentEvent = { id: 'rent', label: 'Rent', date: '2026-12-01', amountCents: 180000, kind: 'expense', confirmation: 'confirmed' };
    input = putPayment(input, { kind: 'housing', id: 'home' }, rent);
    input = putPayment(input, { kind: 'housing', id: 'home' }, { ...rent, id: 'deposit', label: 'Deposit', amountCents: 100000, kind: 'refundable-deposit' });
    input = putPayment(input, { kind: 'moving', id: 'van' }, { ...rent, id: 'rental', label: 'Van rental', date: '2026-12-02', amountCents: 20000 });
    input = putPayment(input, { kind: 'common' }, { ...rent, id: 'salary', label: 'Payday', date: '2026-12-03', amountCents: 200000, kind: 'income' });
    let plan = calculatePlans(input).plans[0];
    expect(plan.minBalanceCents).toBe(100000);
    expect(plan.endingBalanceCents).toBe(300000);
    expect(plan.costCents).toBe(200000);
    input = putPayment(input, { kind: 'housing', id: 'home' }, { ...rent, amountCents: 185025 });
    plan = calculatePlans(input).plans[0];
    expect(plan.minBalanceCents).toBe(94975);
    expect(plan.costCents).toBe(205025);
    expect(input.commonEvents).toHaveLength(1);
    expect(input.movingOptions[0].events[0].amountCents).toBe(20000);
    input = removePayment(input, { kind: 'housing', id: 'home' }, 'deposit');
    expect(calculatePlans(input).plans[0].minBalanceCents).toBe(194975);
  });

  it('preserves actual values when planned fields change', () => {
    const input = createExample();
    const event = { ...input.commonEvents[0], actual: { date: '2026-11-18', amountCents: 12000 } };
    const updated = putPayment(input, { kind: 'common' }, { ...event, amountCents: 13000 });
    const row = calculatePlans(updated).plans[0].timeline.find(r => r.eventId === event.id)!;
    expect(row.effectiveAmountCents).toBe(12000);
    expect(row.plannedAmountCents).toBe(13000);
  });

  it('requires an explicit payment for an option but permits an explicit zero cost', () => {
    const input = createExample(); input.movingOptions[0].events = [];
    expect(calculatePlans(input).plans).toEqual([]);
    input.movingOptions[0].events = [{ id: 'free-move', label: 'Friend helps for free', date: '2026-11-25', amountCents: 0, kind: 'expense', confirmation: 'confirmed' }];
    expect(calculatePlans(input).errors).toEqual([]);
    expect(calculatePlans(input).plans[0].costCents).toBe(335000);
  });

  it('shows why a future bill or unconfirmed payday is excluded', () => {
    const event: PaymentEvent = { id: 'bill', label: 'Bill', date: '2027-03-01', amountCents: 10000, kind: 'expense', confirmation: 'confirmed' };
    expect(paymentTimingNote(event, '2026-11-15')).toContain('Outside');
    expect(paymentTimingNote({ ...event, date: '2026-11-16', kind: 'income', confirmation: 'proposed' }, '2026-11-15')).toContain('Unconfirmed income');
  });
});
