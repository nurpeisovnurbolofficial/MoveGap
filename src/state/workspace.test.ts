import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceController, RECOVERY_PREFIX } from './workspace';
import { DRAFT_KEY } from './draft';
import { cloudPlanDocumentExample } from '../contracts/cloudPlan.examples';

function storage(): Storage {
  const data: Record<string, string> = {};
  Object.defineProperties(data, {
    getItem: { value: (key: string) => Object.hasOwn(data, key) ? data[key] : null },
    setItem: { configurable: true, value: (key: string, value: string) => { data[key] = value; } },
    removeItem: { value: (key: string) => { delete data[key]; } },
    clear: { value: () => { Object.keys(data).forEach(key => delete data[key]); } },
    key: { value: (index: number) => Object.keys(data)[index] ?? null },
    length: { get: () => Object.keys(data).length },
  });
  return data as unknown as Storage;
}
function locks() {
  let tail = Promise.resolve();
  return { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => {
    const next = tail.then(callback); tail = next.then(() => {}, () => {}); return next;
  } } as unknown as Pick<LockManager, 'request'>;
}
beforeEach(() => vi.stubGlobal('location', { origin: 'https://movegap.test', href: 'https://movegap.test/' }));
afterEach(() => vi.unstubAllGlobals());

it('restores unfinished cash and editor fields without sending an invalid cloud document', async () => {
  const local = storage(); const a = new WorkspaceController(local, locks());
  a.updateInput({ ...a.input, openingCashCents: NaN }); a.setField('cash.raw', '12..');
  a.setField('open.option', { kind: 'housing' }); a.setField('option.label', 'Unfinished home');
  expect(await a.save()).toBe(true);
  const b = new WorkspaceController(local, locks());
  expect(Number.isNaN(b.input.openingCashCents)).toBe(true);
  expect(b.content.formDrafts['cash.raw']).toBe('12..');
  expect(b.content.formDrafts['option.label']).toBe('Unfinished home');
  expect(b.completeDocument()).toBeNull();
  b.updateInput({ ...b.input, openingCashCents: 100000 }); b.setField('open.option', null);
  expect(await b.save()).toBe(true); expect(b.completeDocument()).not.toBeNull();
});

it('keeps the full previous local draft recoverable before loading a cloud document', async () => {
  const local = storage(); const a = new WorkspaceController(local, locks());
  a.updateInput({ ...a.input, openingCashCents: 12345 }); a.setField('option.label', 'Keep this draft text');
  await a.save(); await a.replaceDocument(cloudPlanDocumentExample());
  const copy = a.recoveryCopies()[0]; expect(copy.key.startsWith(RECOVERY_PREFIX)).toBe(true);
  expect(a.selectedId).toBe(cloudPlanDocumentExample().selectedId);
  await a.restoreRecovery(copy.key);
  expect(a.input.openingCashCents).toBe(12345);
  expect(a.content.formDrafts['option.label']).toBe('Keep this draft text');
});

it('does not overwrite an unreadable but structurally versioned saved draft', async () => {
  const local = storage();
  const raw = JSON.stringify({ version: 2, revision: 1, tabId: 'other', updatedAt: new Date().toISOString(),
    content: { inputDraft: { corrupt: true }, selectedId: null, formDrafts: {} } });
  local.setItem(DRAFT_KEY, raw);
  const a = new WorkspaceController(local, locks());
  expect(a.localStatus().kind).toBe('error');
  a.updateInput({ ...a.input, openingCashCents: 100 });
  expect(await a.save()).toBe(false); expect(local.getItem(DRAFT_KEY)).toBe(raw);
});

it('does not replace current work when the recovery copy cannot be stored', async () => {
  const local = storage(); const a = new WorkspaceController(local, locks()); await a.save();
  const restricted = new Proxy(local, { get(target, key) {
    if (key === 'setItem') return (name: string, value: string) => { if (name.startsWith(RECOVERY_PREFIX)) throw new Error('Quota'); target.setItem(name, value); };
    return Reflect.get(target, key);
  } });
  const b = new WorkspaceController(restricted, locks());
  const before = b.input.openingCashCents;
  await expect(b.replaceDocument(cloudPlanDocumentExample())).rejects.toThrow('Quota');
  expect(b.input.openingCashCents).toBe(before);
});

it('allows free local saving before selecting a plan and keeps actuals and links', async () => {
  const local = storage(); const a = new WorkspaceController(local, locks());
  const doc = cloudPlanDocumentExample(); a.updateInput(doc.input);
  expect(await a.save()).toBe(true);
  const b = new WorkspaceController(local, locks());
  expect(b.selectedId).toBeNull(); expect(b.input).toEqual(doc.input);
  expect(b.completeDocument()?.input).toEqual(doc.input);
});
