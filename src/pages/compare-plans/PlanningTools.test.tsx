import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createExample } from '../../domain/example';
import { calculatePlans } from '../../domain/engine';
import { CashCalendar, OptionMatrix, ScenarioControls, PlanRecovery } from './PlanningTools';

const noop = () => {};

describe('Comparison exploration UI', () => {
  it('renders all 60 day buttons with one keyboard entry point and no invented January bills', () => {
    const input = createExample(); const plan = calculatePlans(input).plans[0];
    const html = renderToStaticMarkup(<CashCalendar input={input} plan={plan}/>);
    expect((html.match(/class="calendar-day /g) ?? []).length).toBe(60);
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect(html).toContain('Nov 2026'); expect(html).toContain('Jan 2027');
    expect(html).toContain('Days with a cash shortfall</dt><dd>3</dd>');
    expect(html).toContain('Dec 1 · Short by $1,150');
    expect(html).toContain('Old rent'); expect(html).toContain('New rent');
  });
  it('shows incompatible matrix pairs as explanations, never as selectable plans', () => {
    const input = createExample(); const result = calculatePlans(input);
    const html = renderToStaticMarkup(<OptionMatrix input={input} result={result} focusedId={result.plans[2].id} onSelect={noop}/>);
    expect((html.match(/<button/g) ?? []).length).toBe(3);
    expect(html).toContain('Not available'); expect(html).toContain('New home is not available on this move date.');
    expect(html).toContain('Plan 3 · Best fit');
  });
  it('does not claim a best fit for unconfirmed plans', () => {
    const input = createExample(); input.housingOptions.forEach(h => { h.confirmation = 'proposed'; });
    const result = calculatePlans(input);
    const html = renderToStaticMarkup(<OptionMatrix input={input} result={result} focusedId={result.plans[0].id} onSelect={noop}/>);
    expect(html).not.toContain('matrix-best'); expect(html).toContain('Needs confirmation');
  });
  it('explains why the income-delay control is unavailable without a future confirmed income', () => {
    const input = createExample(); input.commonEvents = input.commonEvents.filter(e => e.kind !== 'income');
    const result = calculatePlans(input);
    const html = renderToStaticMarkup(<ScenarioControls input={input} original={result} current={result} eventId="" days={2} active={false} onEvent={noop} onDays={noop} onActive={noop}/>);
    expect(html).toContain('No future confirmed income to delay.'); expect(html).not.toContain('type="checkbox"');
  });
  it('labels a payment-date test as an unagreed request with an editable unsent draft', () => {
    const input = createExample(); const result = calculatePlans(input);
    const html = renderToStaticMarkup(<PlanRecovery input={input} plan={result.plans[0]} number={1} onBack={noop}/>);
    expect(html).toContain('What would make Plan 1 work?'); expect(html).toContain('You would still need $50 more');
    expect(html).toContain('not an agreed deadline'); expect(html).toContain('Nothing has been saved or sent.');
    expect(html).toContain('<textarea'); expect(html).not.toContain('readonly');
  });
});
