import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createExample } from '../domain/example';
import { calculatePlans, addDays } from '../domain/engine';
import { CashChart } from './CashChart';

describe('CashChart accessible event inspection', () => {
  it('keeps same-day events separate with an accessible selector and text balance', () => {
    const input = createExample(); const plan = calculatePlans(input).plans[0];
    const html = renderToStaticMarkup(<CashChart input={input} plan={plan}/>);
    expect(html).toContain('Dec 1 · Old rent</option>'); expect(html).toContain('Dec 1 · New rent</option>');
    expect(html).toContain('Cash left:'); expect(html).toContain('-$1,150');
    expect(html).toContain('Lowest point'); expect(html).toContain('Reserve $500');
    expect(html).toContain('tabindex="0"'); expect(html).not.toContain('NaN');
  });
  it('uses engine actuals from other alternatives without losing recorded payments', () => {
    const input = createExample(); input.movingOptions[0].events[0].actual = { date:'2026-11-25', amountCents:90000 };
    input.movingOptions[1].events[0].actualLinks = {'truck-early':'separate-payment'};
    const plan = calculatePlans(input).plans[2];
    const html = renderToStaticMarkup(<CashChart input={input} plan={plan} compact/>);
    expect(html).toContain('Nov 25 · Moving service · Actual');
    expect(plan.timeline.filter(row => row.eventId === 'truck-early')).toHaveLength(1);
    expect(html).toContain('Dec 4 · Moving service</option>');
  });
  it('handles no in-window events and a zero reserve', () => {
    const input = createExample(); input.openingCashCents = 0; input.reserveCents = 0; input.commonEvents = [];
    for(const option of [...input.housingOptions,...input.movingOptions]) option.events.forEach(e=>{ e.amountCents=0;e.date=addDays(input.startDate,-1); });
    const plan = calculatePlans(input).plans[0];
    const html = renderToStaticMarkup(<CashChart input={input} plan={plan}/>);
    expect(html).toContain('Starting cash'); expect(html).toContain('Reserve $0'); expect(html).not.toContain('NaN');
    expect(html.match(/<option /g)).toHaveLength(1);
  });
});
