import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePlans } from '../../domain/engine';
import { createExample } from '../../domain/example';
import type { MoveInput } from '../../domain/types';
import { ComparePlansPage } from './ComparePlansPage';

// Page states are tested here; the existing chart is checked in the browser.
vi.mock('../../components/CashChart', () => ({ CashChart: () => <div>Cash chart</div> }));

function render(input: MoveInput) {
  return renderToStaticMarkup(<ComparePlansPage input={input} result={calculatePlans(input)} onChoose={() => {}} onBack={() => {}}/>);
}

describe('Compare Plans explanations', () => {
  it('explains all confirmed plans fitting without claiming lower expenses', () => {
    const input = createExample(); input.openingCashCents = 700000;
    const html = render(input);
    expect(html).toContain('3 of 3 plans are confirmed and keep your $500 reserve.');
    expect(html).toContain('These plans have the same expenses.');
    expect(html).toContain('If plans tie, one is highlighted.');
  });

  it('shows some fitting, combined engine highlights, and the actual shortfall event', () => {
    const html = render(createExample());
    expect(html).toContain('1 of 3 plans are confirmed and keep your $500 reserve.');
    expect(html.match(/Earliest that fits/g)).toHaveLength(1);
    expect(html.match(/Lowest cost/g)).toHaveLength(1);
    expect(html.match(/Most cash left at the lowest point/g)).toHaveLength(1);
    expect(html).toContain('First time you can’t cover a payment: Dec 1');
    expect(html).toContain('after New rent ($1,550)');
    expect(html).toContain('Lowest balance in this plan');
  });

  it('explains no plans fitting and keeps editing and choosing available', () => {
    const input = createExample(); input.openingCashCents = 100000;
    const html = render(input);
    expect(html).toContain('No confirmed plans keep your $500 reserve.');
    expect(html).toContain('Edit your move');
    expect(html).toContain('Not enough cash');
    expect(html.match(/>Choose this plan</g)).toHaveLength(3);
  });

  it('does not present unconfirmed plans as recommendations', () => {
    const input = createExample(); input.openingCashCents = 700000;
    input.housingOptions.forEach(option => { option.confirmation = 'proposed'; });
    const html = render(input);
    expect(html).toContain('The amounts fit, but the terms still need confirmation.');
    expect(html).toContain('3 plans need confirmation');
    expect(html).not.toContain('Earliest that fits');
    expect(html).not.toContain('Lowest cost');
  });

  it('explains incompatible dates without rendering plan actions', () => {
    const input = createExample(); input.latestMoveDate = '2026-11-24';
    const html = render(input);
    expect(html).toContain('These dates don’t work together.');
    expect(html).toContain('Edit your move');
    expect(html).not.toContain('Choose this plan');
  });

  it('shows validation errors instead of an incompatible-dates explanation', () => {
    const input = createExample(); input.openingCashCents = NaN;
    const html = render(input);
    expect(html).toContain('Fix your information to compare plans.');
    for (const error of calculatePlans(input).errors) expect(html).toContain(error);
    expect(html).not.toContain('These dates don’t work together.');
    expect(html).not.toContain('$NaN');
  });

  it('identifies starting cash below reserve before blaming any payment', () => {
    const input = createExample(); input.openingCashCents = 10000;
    expect(render(input)).toContain('Your starting cash is already below your reserve, before any payments.');
  });
});

