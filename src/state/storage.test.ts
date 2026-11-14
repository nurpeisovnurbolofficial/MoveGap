import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExample } from '../domain/example';
import { calculatePlans } from '../domain/engine';
import { loadSnapshot, parseSnapshot, saveSnapshot, STORAGE_KEY } from './storage';

afterEach(() => vi.unstubAllGlobals());

describe('saved workspace boundary', () => {
  it('restores a selected plan and actual payment without duplicating the outflow', () => {
    const input = createExample();
    input.commonEvents[0].actual = { date: '2026-11-18', amountCents: 12500 };
    const selectedId = calculatePlans(input).cheapestPlanId;
    const restored = parseSnapshot(JSON.stringify({ input, selectedId, savedAt: '2026-11-14T20:00:00Z' }));
    const plan = calculatePlans(restored.input).plans.find(p => p.id === restored.selectedId)!;
    expect(plan.costCents).toBe(407500);
    const payment = plan.timeline.filter(e => e.eventId === input.commonEvents[0].id);
    expect(payment).toHaveLength(1);
    expect(payment[0].date).toBe('2026-11-18');
    expect(payment[0].plannedDate).toBe('2026-11-17');
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
  it('restores the selected plan and a received deposit after a reload', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    });
    const input = createExample();
    const refund = input.commonEvents.find(event => event.kind === 'deposit-refund')!;
    refund.actual = { date: '2026-12-21', amountCents: 120000 };
    const selectedId = calculatePlans(input).cheapestPlanId!;
    saveSnapshot({ input, selectedId, savedAt: '2026-11-15T01:00:00.000Z' });
    const restored = loadSnapshot();
    expect(restored.error).toBeNull();
    expect(restored.snapshot?.selectedId).toBe(selectedId);
    const plan = calculatePlans(restored.snapshot!.input).plans.find(item => item.id === selectedId)!;
    expect(plan.timeline.filter(row => row.eventId === refund.id)).toHaveLength(1);
    expect(plan.timeline.find(row => row.eventId === refund.id)?.effectiveAmountCents).toBe(120000);
  });
  it('keeps damaged saved data untouched and reports a storage failure', () => {
    const data = new Map([[STORAGE_KEY, '{bad json']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: () => { throw new Error('Storage blocked'); },
    });
    expect(loadSnapshot().snapshot).toBeNull();
    expect(loadSnapshot().error).toMatch(/could not be opened/);
    expect(data.get(STORAGE_KEY)).toBe('{bad json');
    expect(() => saveSnapshot({ input: createExample(), selectedId: null, savedAt: '2026-11-15T01:00:00.000Z' })).toThrow('Storage blocked');
  });
});
