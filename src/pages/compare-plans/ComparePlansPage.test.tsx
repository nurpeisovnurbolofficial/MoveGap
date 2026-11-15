import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePlans } from '../../domain/engine';
import { createExample } from '../../domain/example';
import { cloudPlanDocumentExample } from '../../contracts/cloudPlan.examples';
import type { MoveInput } from '../../domain/types';
import { ComparePlansPage } from './ComparePlansPage';
import { closestPlan, criticalDay, highlights, optionRows, unconfirmedItems } from './planInsights';

// Page states are tested here; the shared chart is checked in the browser.
vi.mock('../../components/CashChart', () => ({ CashChart: () => <div>Cash chart</div> }));

function render(input: MoveInput, currentPlanId: string | null = null) {
  return renderToStaticMarkup(<ComparePlansPage input={input} result={calculatePlans(input)} onChoose={() => {}} onBack={() => {}} currentPlanId={currentPlanId}/>);
}
/** Visible text only, so assertions don't depend on markup between words. */
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('Compare Plans decision summary', () => {
  it('names a single best fit instead of three separate highlights when one plan wins everything', () => {
    const html = render(createExample());
    const t = text(html);
    expect(t).toContain('BEST FIT');
    expect(t).toContain('Plan 3 · Move Dec 4');
    expect(t).toContain('The only one of your 3 plans that is confirmed and keeps your $500 reserve.');
    expect(count(html, '>Best fit<')).toBe(1);
    expect(t).not.toContain('Lowest cost');
    expect(t).not.toContain('Earliest move');
  });

  it('shows each highlight when plans differ and reports ties honestly', () => {
    const input = createExample(); input.openingCashCents = 700000;
    const t = text(render(input));
    expect(t).toContain('3 of 3 plans are confirmed and keep your $500 reserve.');
    expect(t).toContain('Tie · Plans 1, 2, 3');
    expect(count(t, 'Lowest cost · tie')).toBe(3);
    expect(count(t, 'Earliest move')).toBe(2); // summary tile + Plan 1 badge
    expect(t).toContain('All plans have the same spending ($4,050).');
    expect(t).not.toContain('BEST FIT');
    const { items } = highlights(calculatePlans(input));
    expect(items.map(item => [item.key, item.winnerIds.length])).toEqual([['earliest', 1], ['cheapest', 3], ['buffer', 1]]);
  });

  it('points to the closest plan and shows it in detail when no plan fits', () => {
    const input = createExample(); input.openingCashCents = 100000;
    const html = render(input);
    const t = text(html);
    expect(t).toContain('No confirmed plan keeps your $500 reserve.');
    expect(t).toContain('Closest: Plan 3 · Move Dec 4 still needs $2,900 more to keep your reserve.');
    expect(html).toContain('id="compare-detail-title">Plan 3');
    expect(closestPlan(calculatePlans(input)).id).toBe(calculatePlans(input).plans[2].id);
    expect(count(t, 'Choose this plan')).toBe(3);
    expect(count(html, 'button secondary full-width')).toBe(3); // unsafe plans stay available, but not promoted
  });

  it('does not present unconfirmed plans as recommendations and names what to confirm', () => {
    const input = createExample(); input.openingCashCents = 700000;
    input.housingOptions.forEach(option => { option.confirmation = 'proposed'; });
    const t = text(render(input));
    expect(t).toContain('The amounts work, but the terms aren’t confirmed yet.');
    expect(t).toContain('3 plans need confirmation before you rely on the terms.');
    expect(t).toContain('Confirm before relying on it: Original payment schedule (housing terms).');
    expect(t).not.toContain('Best fit');
    expect(t).not.toContain('Lowest cost');
    const plan = calculatePlans(input).plans[0];
    expect(unconfirmedItems(plan, input)).toEqual(['Original payment schedule (housing terms)']);
  });
});

describe('Compare Plans explanations', () => {
  it('explains the critical day: payments that cause it and when money comes in next', () => {
    const t = text(render(createExample()));
    expect(t).toContain('Critical day · Dec 1');
    expect(t).toContain('You start the day with $2,100.');
    expect(t).toContain('Drops below your reserve');
    expect(t).toContain('Can’t cover this payment');
    expect(t).toContain('Next money in: Take-home pay +$2,400 on Dec 3 — 2 days later.');
    expect(t).toContain('You need $1,650 more to keep your reserve — $1,150 just to cover every payment.');
    expect(t).toContain('Tightest day · Dec 1'); // the plan that fits still shows its lowest point
  });

  it('says on each card which payments cause the low point and when money comes in', () => {
    const t = text(render(createExample()));
    expect(t).toContain('Dec 1: Old rent $1,700 + New rent $1,550 due. Take-home pay +$2,400 arrives Dec 3 — 2 days later.');
    expect(t).toContain('Tightest day Dec 1: Old rent $1,700 leaves $1,100.');
    expect(t).toContain('Stays above your $500 reserve for all 60 days.');
  });

  it('keeps the page to one answer, the cards, the detail and one test-and-fix section', () => {
    const html = render(createExample());
    const t = text(html);
    expect(t).not.toContain('What changes between plans');
    expect(t).toContain('What if something changes?');
    expect(t).toContain('Find payment changes');
    expect(t).toContain('What if your Take-home pay (Dec 3) arrives 2 days late?');
    expect(t).toContain('Dec 1: Tightest day in this plan');
    expect(t).toContain('Home ready Nov 25');
    expect(html.indexOf('compare-quick-test')).toBeLessThan(html.indexOf('id="compare-card-1"'));
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>(Choose|Use real dates)/);
    expect(html.indexOf('id="compare-summary-title"')).toBeLessThan(html.indexOf('id="compare-card-1"'));
    expect(html.indexOf('id="compare-card-1"')).toBeLessThan(html.indexOf('id="compare-tools"'));
  });

  it('marks the day cash runs out for the closest plan when nothing fits', () => {
    const input = createExample(); input.openingCashCents = 100000;
    expect(text(render(input))).toContain('Plan 3 runs out of cash');
  });

  it('reads the critical day from the engine timeline without recalculating it', () => {
    const input = createExample();
    const plan = calculatePlans(input).plans[0];
    const day = criticalDay(plan, input);
    expect(day.date).toBe(plan.minBalanceDate);
    expect(day.rows.map(row => row.label)).toEqual(['Old rent', 'New rent']);
    expect(day.rows.at(-1)?.balanceCents).toBe(plan.minBalanceCents);
    expect(day.startBalanceCents).toBe(210000);
    expect(day.nextIncome?.label).toBe('Take-home pay');
  });

  it('shows different payment dates for plans with the same moving day', () => {
    const input = createExample();
    const [, plan2, plan3] = calculatePlans(input).plans;
    expect(plan2.moveDate).toBe(plan3.moveDate);
    const rentDate = (rows: ReturnType<typeof optionRows>) => rows.find(row => row.label === 'New rent')?.date;
    expect(rentDate(optionRows(plan2, input))).toBe('2026-12-01');
    expect(rentDate(optionRows(plan3, input))).toBe('2026-12-04');
    expect(optionRows(plan2, input).some(row => row.label === 'Old rent')).toBe(false); // shared payments are not repeated
    expect(text(render(input))).toContain('Payments for this option');
  });

  it('lists combinations left out because of dates, with the reason', () => {
    const t = text(render(createExample()));
    expect(t).toContain('1 combination isn’t shown because the dates don’t work together:');
    expect(t).toContain('Agreed December 4 schedule + November 25 move — New home is not available on this move date.');
  });

  it('identifies starting cash below reserve before blaming any payment', () => {
    const input = createExample(); input.openingCashCents = 10000;
    const t = text(render(input));
    expect(t).toContain('Your starting cash is already below your reserve, before any payments.');
    expect(t).not.toContain('Drops below your reserve');
  });

  it('says when the lowest balance is the starting cash', () => {
    const input = createExample();
    for (const event of [...input.commonEvents, ...input.housingOptions.flatMap(h => h.events), ...input.movingOptions.flatMap(m => m.events)]) {
      if (event.kind !== 'income') event.amountCents = 0;
    }
    expect(text(render(input))).toContain('Your lowest balance is your starting cash, before any payments.');
  });

  it('marks the plan chosen earlier when the user comes back', () => {
    const input = createExample();
    const first = calculatePlans(input).plans[0].id;
    const html = render(input, first);
    expect(count(html, '>Your current plan<')).toBe(1);
    expect(count(html, 'Continue with this plan<')).toBe(1);
    expect(html).toContain('id="compare-detail-title">Plan 1');
  });

  it('keeps an actual payment from a previous option in the chosen plan detail', () => {
    const { input, selectedId } = cloudPlanDocumentExample();
    const detail = text(render(input, selectedId).split('id="compare-detail"')[1]);
    expect(detail).toContain('Cash on day 60$350');
    expect(detail).toContain('Moving serviceActual');
    expect(detail).toContain('−$900');
    expect(detail).toContain('recorded in November 25 move; kept in every plan');
  });

  it('does not charge a linked payment again after changing options', () => {
    const { input, selectedId } = cloudPlanDocumentExample();
    input.movingOptions[1].events[0].actualLinks = { 'truck-early': 'same-payment' };
    const detail = text(render(input, selectedId).split('id="compare-detail"')[1]);
    expect(detail).toContain('Cash on day 60$1,050');
    expect(detail).toContain('no second planned charge');
  });
});

describe('Compare Plans empty and error states', () => {
  it('explains incompatible dates without rendering plan actions', () => {
    const input = createExample(); input.latestMoveDate = '2026-11-24';
    const t = text(render(input));
    expect(t).toContain('These dates don’t work together.');
    expect(t).toContain('Move is after your latest allowed date.');
    expect(t).toContain('Edit your move');
    expect(t).not.toContain('Choose this plan');
  });

  it('shows validation errors instead of an incompatible-dates explanation', () => {
    const input = createExample(); input.openingCashCents = NaN;
    const t = text(render(input));
    expect(t).toContain('Fix your information to compare plans.');
    for (const error of calculatePlans(input).errors) expect(t).toContain(error);
    expect(t).not.toContain('These dates don’t work together.');
    expect(t).not.toContain('$NaN');
  });
});
