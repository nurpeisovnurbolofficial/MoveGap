import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createExample } from '../../domain/example';
import { calculatePlans } from '../../domain/engine';
import { nextUnpaidExpense, paymentDeviation } from './paymentInsights';
import { UpcomingPayment } from './UpcomingPayment';

const selected = (input: ReturnType<typeof createExample>) => calculatePlans(input).plans
  .find(plan => plan.housingId === 'home-later' && plan.movingId === 'mover-later')!;

describe('payment tracker insights', () => {
  it('shows the earliest future payment and explicitly dates the view', () => {
    const plan = selected(createExample());
    expect(nextUnpaidExpense(plan, '2026-11-15')?.row.eventId).toBe('application');
    const html = renderToStaticMarkup(createElement(UpcomingPayment, { plan, asOf: '2026-11-15', onRecord: () => {} }));
    expect(html).toContain('As of Nov 15, 2026');
    expect(html).toContain('Application fee');
    expect(html).toContain('COMING UP');
  });

  it('prioritizes overdue unpaid expenses and ignores an obligation covered by a linked fact', () => {
    const input = createExample();
    input.housingOptions[0].events[0].actual = { date: '2026-11-20', amountCents: 160000 };
    input.housingOptions[1].events[0].actualLinks = { 'deposit-early': 'same-payment' };
    const plan = selected(input);
    const next = nextUnpaidExpense(plan, '2026-12-02');
    expect(next?.overdueCount).toBeGreaterThan(0);
    expect(next?.row.eventId).toBe('application');
    expect(plan.timeline.some(row => row.eventId === 'deposit-later')).toBe(false);
  });

  it('reports a completed schedule when all selected expenses are recorded', () => {
    const input = createExample();
    for (const event of [...input.commonEvents, ...input.housingOptions[1].events, ...input.movingOptions[1].events]) {
      if (event.kind === 'expense' || event.kind === 'refundable-deposit')
        event.actual = { date: event.date, amountCents: event.amountCents };
    }
    expect(nextUnpaidExpense(selected(input), '2026-12-10')).toBeNull();
  });

  it('distinguishes expense, income and deposit deviations without calling receipts savings', () => {
    const input = createExample();
    const expense = { ...input.commonEvents[0], actual: { date: '2026-11-19', amountCents: 12500 } };
    expect(paymentDeviation(expense)).toEqual({ amount: 'Payment made: $25 more than planned', timing: '2 days later than planned' });
    const income = { ...input.commonEvents[2], actual: { date: '2026-12-02', amountCents: 230000 } };
    expect(paymentDeviation(income)?.amount).toBe('Income received: $100 less than planned');
    const refund = { ...input.commonEvents[3], actual: { date: '2026-12-20', amountCents: 150000 } };
    expect(paymentDeviation(refund)?.amount).toBe('Deposit returned: $100 more than planned');
  });
});
