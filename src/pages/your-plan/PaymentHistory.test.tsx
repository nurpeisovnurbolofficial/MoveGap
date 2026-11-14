import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createExample } from '../../domain/example';
import { calculatePlans } from '../../domain/engine';
import { PaymentHistory } from './PaymentHistory';

describe('recorded payment history', () => {
  it('shows an outside-window fact without a selected plan', () => {
    const input = createExample();
    input.commonEvents[0].actual = { date: '2027-02-01', amountCents: 12500 };
    const html = renderToStaticMarkup(createElement(PaymentHistory, { input, onRecord: () => {} }));
    expect(html).toContain('Feb 1');
    expect(html).toContain('Outside the 60-day forecast; no plan selected');
    expect(html).toContain('Edit or clear actual');
  });

  it('explains a former-option fact counted by the engine and a fact before the start date', () => {
    const input = createExample();
    input.commonEvents[0].actual = { date: '2026-11-01', amountCents: 9000 };
    input.housingOptions[0].events[0].actual = { date: '2026-11-22', amountCents: 160000 };
    const plan = calculatePlans(input).plans.find(p => p.housingId === 'home-later')!;
    const html = renderToStaticMarkup(createElement(PaymentHistory, { input, plan, onRecord: () => {} }));
    expect(html).toContain('Before the plan starts');
    expect(html).toContain('Original payment schedule · Included in this forecast');
    expect(html).toContain('Planned');
  });
});
