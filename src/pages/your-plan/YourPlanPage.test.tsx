import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createExample } from '../../domain/example';
import { YourPlanPage } from './YourPlanPage';

const noop = () => {};
const render = (input = createExample()) => renderToStaticMarkup(<YourPlanPage input={input} onCompare={noop} onSave={noop} onRecord={noop} savedAt={null} dirty={false}/>);

describe('Payment tracker before a plan is chosen', () => {
  it('shows one next step without file backup tools', () => {
    const html = render();
    expect(html).toContain('First, choose your moving plan.');
    expect(html).not.toContain('Recorded payment history');
    expect(html).not.toContain('Your data backup');
    expect(html).not.toContain('Restore a plan from a backup file');
  });
  it('keeps real payment history accessible even with no selected plan', () => {
    const input = createExample();
    input.commonEvents[0].actual = { date: input.commonEvents[0].date, amountCents: 8050 };
    expect(render(input)).toContain('Recorded payment history');
    expect(render(input)).toContain('$80.50');
  });
});
