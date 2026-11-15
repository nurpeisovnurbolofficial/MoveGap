import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePlans } from '../../domain/engine';
import { createExample } from '../../domain/example';
import { OverviewPage } from './OverviewPage';
import { createOwnMove } from '../your-move/inputHelpers';

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
  it('gives the jury a one-minute path only on the example', () => {
    expect(render()).toContain('Fictional example · try it in 1 minute');
    expect(render(createExample(), 'own')).not.toContain('try it in 1 minute');
  });
  it('does not mark a blank move complete or offer tracking before a choice', () => {
    const t = render(createOwnMove(), 'own');
    expect(t).not.toContain('Done');
    expect(t).toContain('Next1. Your move');
    expect(t).toContain('Later2. Compare plans');
    expect(t).toContain('Later3. Payment tracker');
  });
  it('marks comparison done only after a plan is selected', () => {
    const input = createExample(); const result = calculatePlans(input);
    const t = renderToStaticMarkup(<OverviewPage input={input} result={result} selected={result.plans[0]} source="own" onEdit={noop} onCompare={noop} onTrack={noop}/>).replace(/<[^>]+>/g, '');
    expect(t).toContain('Done2. Compare plans');
    expect(t).toContain('Next3. Payment tracker');
  });
});
