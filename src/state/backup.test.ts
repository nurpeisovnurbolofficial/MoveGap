import { describe, expect, it } from 'vitest';
import { createExample } from '../domain/example';
import { calculatePlans } from '../domain/engine';
import { createPlanBackup, parsePlanBackup, restorePlanBackup, BACKUP_PREFIX } from './backup';
import { STORAGE_KEY } from './storage';
import { DRAFT_KEY } from './draft';

function memoryStorage(seed?: string) {
  const data = new Map<string, string>();
  if (seed) data.set(STORAGE_KEY, seed);
  return { data, getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe('manual plan backup', () => {
  it('round trips an actual, a selected plan and explicit relationships', () => {
    const input = createExample();
    input.commonEvents[0].actual = { date: '2027-02-01', amountCents: 8500 };
    input.housingOptions[0].events[0].actual = { date: '2026-11-20', amountCents: 160000 };
    input.housingOptions[1].events[0].actualLinks = { 'deposit-early': 'separate-payment' };
    const selectedId = calculatePlans(input).plans.find(plan => plan.housingId === 'home-later' && plan.movingId === 'mover-later')!.id;
    const file = parsePlanBackup(createPlanBackup(input, selectedId));
    const storage = memoryStorage();
    restorePlanBackup(file, storage, null);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).input).toEqual(input);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).selectedId).toBe(selectedId);
  });

  it('rejects corrupt, duplicate-ID and invalid-money files without touching data', () => {
    const original = createPlanBackup(createExample(), null);
    const storage = memoryStorage(original);
    expect(() => parsePlanBackup('{broken')).toThrow();
    const duplicate = JSON.parse(original);
    duplicate.snapshot.input.commonEvents[1].id = duplicate.snapshot.input.commonEvents[0].id;
    expect(() => parsePlanBackup(JSON.stringify(duplicate))).toThrow();
    const negative = JSON.parse(original);
    negative.snapshot.input.commonEvents[0].actual = { date: '2026-11-17', amountCents: -1 };
    expect(() => parsePlanBackup(JSON.stringify(negative))).toThrow();
    expect(storage.data.get(STORAGE_KEY)).toBe(original);
  });

  it('preserves the previous record and refuses a changed baseline', () => {
    const original = createPlanBackup(createExample(), null);
    const storage = memoryStorage(original);
    const next = createExample(); next.openingCashCents = 200000;
    const file = parsePlanBackup(createPlanBackup(next, null));
    expect(() => restorePlanBackup(file, storage, 'stale')).toThrow(/Another tab/);
    expect(storage.data.get(STORAGE_KEY)).toBe(original);
    const preserved = restorePlanBackup(file, storage, original)!;
    expect(preserved.startsWith(BACKUP_PREFIX)).toBe(true);
    expect(storage.data.get(preserved)).toBe(original);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).input.openingCashCents).toBe(200000);
  });

  it('refuses a v1-only restore when an autosaved v2 draft is active', () => {
    const original = createPlanBackup(createExample(), null);
    const storage = memoryStorage(original);
    storage.data.set(DRAFT_KEY, 'active draft');
    expect(() => restorePlanBackup(parsePlanBackup(original), storage, original)).toThrow(/draft controller/);
    expect(storage.data.get(STORAGE_KEY)).toBe(original);
  });
});
