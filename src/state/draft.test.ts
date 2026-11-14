import { describe, expect, it } from 'vitest';
import { createExample } from '../domain/example';
import { DRAFT_KEY, DraftSession, completeDraftInput, readDraft, type DraftContent } from './draft';
import { STORAGE_KEY } from './storage';

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function locks() {
  let tail = Promise.resolve();
  return { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => {
    const next = tail.then(callback);
    tail = next.then(() => {}, () => {});
    return next;
  } } as unknown as Pick<LockManager, 'request'>;
}

const content = (cash: number, raw = ''): DraftContent => ({
  inputDraft: { ...createExample(), openingCashCents: cash },
  selectedId: null,
  formDrafts: { paymentAmount: raw },
});

describe('draft persistence', () => {
  it('autosaves the latest values and unfinished fields across a reload', async () => {
    const storage = memoryStorage(); const lock = locks();
    const first = new DraftSession(storage, lock, undefined, 'tab-a');
    await Promise.all([first.autosave(content(450000)), first.autosave(content(200000, '2,0'))]);
    expect(first.status).toBe('saved');
    const reloaded = new DraftSession(storage, lock, undefined, 'tab-b');
    expect((reloaded.currentContent?.inputDraft as ReturnType<typeof createExample>).openingCashCents).toBe(200000);
    expect(reloaded.currentContent?.formDrafts.paymentAmount).toBe('2,0');
    expect(completeDraftInput(reloaded.currentContent!)).not.toBeNull();
  });

  it('serializes competing tabs and requires an explicit choice before overwriting', async () => {
    const storage = memoryStorage(); const lock = locks();
    const a = new DraftSession(storage, lock, undefined, 'tab-a');
    const b = new DraftSession(storage, lock, undefined, 'tab-b');
    const [aResult, bResult] = await Promise.all([a.autosave(content(800000)), b.autosave(content(450000))]);
    expect(aResult.status).toBe('saved');
    expect(bResult.status).toBe('conflict');
    expect((readDraft(storage).record?.content.inputDraft as ReturnType<typeof createExample>).openingCashCents).toBe(800000);
    expect((b.pending?.inputDraft as ReturnType<typeof createExample>).openingCashCents).toBe(450000);
    expect(b.hasUnprotectedChanges).toBe(true);
    await b.resolveConflict('remote');
    expect(b.hasUnprotectedChanges).toBe(false);
    expect((b.currentContent?.inputDraft as ReturnType<typeof createExample>).openingCashCents).toBe(800000);
  });

  it('keeps old v1 plans and corrupt records untouched', async () => {
    const v1 = JSON.stringify({ input: createExample(), selectedId: null, savedAt: '2026-11-15T00:00:00Z' });
    const storage = memoryStorage({ [STORAGE_KEY]: v1 });
    expect(readDraft(storage).legacy).toBe(true);
    expect(storage.data.has(DRAFT_KEY)).toBe(false);
    await new DraftSession(storage, locks()).autosave(content(200000));
    expect(storage.data.get(STORAGE_KEY)).toBe(v1);
    const broken = memoryStorage({ [DRAFT_KEY]: '{broken', [STORAGE_KEY]: v1 });
    const session = new DraftSession(broken, locks());
    expect(session.status).toBe('error');
    expect((await session.autosave(content(200000))).status).toBe('error');
    expect(broken.data.get(DRAFT_KEY)).toBe('{broken');
  });

  it('reports storage denial without claiming the draft was saved', async () => {
    const storage = { getItem: (_key: string) => null, setItem: () => { throw new Error('Quota exceeded'); } };
    const session = new DraftSession(storage, locks());
    expect((await session.autosave(content(200000))).status).toBe('error');
    expect(session.status).toBe('error');
    expect(session.hasUnprotectedChanges).toBe(true);
  });

  it('reacts to another tab deleting the draft without discarding pending edits', async () => {
    const storage = memoryStorage(); const lock = locks();
    const session = new DraftSession(storage, lock);
    await session.autosave(content(450000));
    session.handleStorageEvent(DRAFT_KEY, null);
    expect(session.record).toBeNull();
    expect(session.status).toBe('saved');
    const second = new DraftSession(storage, lock);
    second.pending = content(200000);
    second.handleStorageEvent(DRAFT_KEY, null);
    expect(second.status).toBe('conflict');
    expect((second.pending.inputDraft as ReturnType<typeof createExample>).openingCashCents).toBe(200000);
  });
});
