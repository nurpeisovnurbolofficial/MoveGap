import { describe, expect, it } from 'vitest';
import { createExample } from '../domain/example';
import { calculatePlans } from '../domain/engine';
import { parseSnapshot } from './storage';

describe('saved workspace boundary', () => {
  it('restores a selected plan and actual payment without duplicating the outflow', () => {
    const input = createExample();
    input.commonEvents[0].actual = { date: '2026-11-18', amountCents: 12500 };
    const selectedId = calculatePlans(input).cheapestPlanId;
    const restored = parseSnapshot(JSON.stringify({ input, selectedId, savedAt: '2026-11-14T20:00:00Z' }));
    const plan = calculatePlans(restored.input).plans.find(p => p.id === restored.selectedId)!;
    expect(plan.costCents).toBe(407500);
    expect(plan.timeline.filter(e => e.eventId === input.commonEvents[0].id)).toHaveLength(1);
  });
  it.each(['null', '{}', '{bad json', JSON.stringify({ input: { commonEvents: null } })])('rejects malformed saved input: %s', raw => {
    expect(() => parseSnapshot(raw)).toThrow();
  });
  it('rejects a selected option that does not exist', () => {
    expect(() => parseSnapshot(JSON.stringify({ input: createExample(), selectedId: 'missing', savedAt: 'today' }))).toThrow();
  });
  it('rejects invalid financial amounts even when JSON has the correct shape', () => {
    const input = createExample(); input.commonEvents[0].amountCents = -100;
    expect(() => parseSnapshot(JSON.stringify({ input, selectedId: null, savedAt: 'today' }))).toThrow();
  });
});
