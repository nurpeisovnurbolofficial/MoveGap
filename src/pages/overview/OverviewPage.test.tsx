import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePlans } from '../../domain/engine';
import { createExample } from '../../domain/example';
import { OverviewPage } from './OverviewPage';

vi.mock('../../components/CashChart', () => ({ CashChart: () => <div>Cash chart</div> }));
const noop = () => {};
const render = (input = createExample(), source: 'example' | 'own' = 'example') =>
  renderToStaticMarkup(<OverviewPage input={input} result={calculatePlans(input)} source={source} onEdit={noop} onCompare={noop} onTrack={noop}/>).replace(/<[^>]+>/g, '');

describe('Overview leads with the answer', () => {
  it('shows the best confirmed plan instead of the first entered one', () => {
    const t = render();
    expect(t).toContain('Best option from your offers');
    expect(t).toContain('Agreed December 4 schedule · December 4 move');
    expect(t).toContain('This option keeps your reserve intact.');
    expect(t).not.toContain('first entered option');
  });
  it('says when no plan works and shows the closest one', () => {
    const input = createExample(); input.openingCashCents = 100000;
    expect(render(input)).toContain('Closest option · none keeps your reserve yet');
  });
  it('says what MoveGap does and shows the three steps with their status', () => {
    const t = render();
    expect(t).toContain('Can you pay for your move on every payment day?');
    expect(t).toContain('1Enter your move');
    expect(t).toContain('2Compare plans');
    expect(t).toContain('3Track payments');
    expect(t).toContain('Done'); expect(t).toContain('Next'); expect(t).toContain('Later');
  });
  it('labels the example only when it is the example', () => {
    expect(render()).toContain('This is a fictional example');
    expect(render(createExample(), 'own')).not.toContain('fictional example');
  });
});
