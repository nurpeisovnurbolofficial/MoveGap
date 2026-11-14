import { describe, expect, it, vi } from 'vitest';
import { cloudPlanDocumentExample, cloudPlanWireExamples } from '../../contracts/cloudPlan.examples';
import type { CloudPlanClient, CloudPlanDocument, CloudPlanRecord } from '../../contracts/cloudPlan';
import { CloudPlanCoordinator, type LocalDraftBridge } from './coordinator';
import { CLOUD_LOCAL_KEY, CloudLocalStore, consumeRestoreFragment, generateCloudSecret, parsePrivateLink, privateLink, readCloudLocal } from './local';
import { HttpCloudPlanClient } from './transport';

const id = '00000000-0000-4000-8000-000000000099';
function storage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); } };
}
function locks() {
  let tail = Promise.resolve();
  return { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => {
    const next = tail.then(callback);
    tail = next.then(() => {}, () => {});
    return next;
  } } as unknown as Pick<LockManager, 'request'>;
}
function bridge(initial = cloudPlanDocumentExample()) {
  let document: CloudPlanDocument = initial;
  const adapter: LocalDraftBridge = {
    completeDocument: () => document,
    currentToken: () => JSON.stringify(document),
    saveCurrentDraft: vi.fn(async () => true),
    replaceWith: vi.fn(async next => { document = next; }),
    localStatus: () => ({ kind: 'saved', savedAt: '2026-11-15T00:00:00.000Z' }),
  };
  return { adapter, change: (next: CloudPlanDocument) => { document = next; } };
}
const record = (): CloudPlanRecord => cloudPlanWireExamples().loaded.value;

describe('cloud transport and local binding', () => {
  it('sends the secret only in Authorization and accepts a validated response envelope', async () => {
    const fetcher = vi.fn(async (_url: URL, _options: RequestInit) => new Response(
      JSON.stringify({ ok: true, value: record() }), { status: 201 }));
    const client = new HttpCloudPlanClient('https://movegap.example/', fetcher as typeof fetch);
    const secret = generateCloudSecret();
    const result = await client.create(secret, { requestId: id, document: cloudPlanDocumentExample() });
    expect(result.ok).toBe(true);
    const [url, options] = fetcher.mock.calls[0];
    expect(url.href).toBe('https://movegap.example/api/cloud-plans');
    expect((options.headers as Record<string, string>).Authorization).toBe(`Bearer ${secret}`);
    expect(String(options.body)).not.toContain(secret);
    expect(options.cache).toBe('no-store');
    expect(options.referrerPolicy).toBe('no-referrer');
  });

  it('rejects malformed success data and wrong-origin links', async () => {
    const client = new HttpCloudPlanClient('https://movegap.example/',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { planId: id } }), { status: 201 })) as typeof fetch);
    const result = await client.create(generateCloudSecret(), { requestId: id, document: cloudPlanDocumentExample() });
    expect(result).toEqual({ ok: false, error: { code: 'INVALID_RESPONSE', outcome: 'unknown' } });
    const access = { planId: id, secret: generateCloudSecret() };
    expect(parsePrivateLink(privateLink(access, 'https://movegap.example/'), 'https://movegap.example/')).toEqual(access);
    expect(parsePrivateLink(privateLink(access, 'https://movegap.example/'), 'https://other.example/')).toBeNull();
    const replaceState = vi.fn();
    expect(consumeRestoreFragment({ href: 'https://movegap.example/#/restore/bad/key',
      origin: 'https://movegap.example', pathname: '/', search: '', hash: '#/restore/bad/key' } as Location,
    { state: null, replaceState } as unknown as History)).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#/overview');
  });

  it('uses revision checks and the new-key header for every mutation', async () => {
    const wire = cloudPlanWireExamples();
    const fetcher = vi.fn(async (url: URL, options: RequestInit) => {
      const value = options.method === 'DELETE'
        ? { planId: id, revision: 2, deletedAt: '2026-11-15T00:00:00.000Z' }
        : url.pathname.endsWith('/rotate-key')
          ? { planId: id, revision: 2, savedAt: '2026-11-15T00:00:00.000Z', expiresAt: '2027-02-13T00:00:00.000Z' }
          : { ...wire.loaded.value, planId: id, revision: 2 };
      return new Response(JSON.stringify({ ok: true, value }), { status: 200 });
    });
    const client = new HttpCloudPlanClient('https://movegap.example/', fetcher as typeof fetch);
    const access = { planId: id, secret: generateCloudSecret() };
    const nextSecret = generateCloudSecret();
    await client.update(access, { requestId: crypto.randomUUID(), expectedRevision: 1, document: wire.create.document });
    await client.remove(access, { requestId: crypto.randomUUID(), expectedRevision: 1 });
    await client.rotateKey(access, nextSecret, { requestId: crypto.randomUUID(), expectedRevision: 1 });
    expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual(['PUT', 'DELETE', 'POST']);
    expect((fetcher.mock.calls[2][1].headers as Record<string, string>)['X-MoveGap-New-Key']).toBe(nextSecret);
    expect(fetcher.mock.calls.every(([url]) => !url.href.includes(access.secret) && !url.href.includes(nextSecret))).toBe(true);
    expect(fetcher.mock.calls.every(([, options]) => String(options.body).includes('"expectedRevision":1'))).toBe(true);
  });

  it('persists key and request before create, then retries the exact request after a lost response', async () => {
    const local = storage(); const binding = new CloudLocalStore(local, locks()); const draft = bridge();
    const calls: Array<{ secret: string; requestId: string }> = [];
    const client = {
      create: vi.fn(async (secret: string, request: { requestId: string }) => {
        const pending = readCloudLocal(local)?.pending;
        expect(pending?.secret).toBe(secret);
        expect(pending?.requestId).toBe(request.requestId);
        calls.push({ secret, requestId: request.requestId });
        return calls.length === 1
          ? { ok: false as const, error: { code: 'NETWORK_ERROR' as const, outcome: 'unknown' as const } }
          : { ok: true as const, value: record() };
      }),
    } as unknown as CloudPlanClient;
    const coordinator = new CloudPlanCoordinator(client, binding, draft.adapter, () => {}, true);
    await coordinator.save();
    expect(coordinator.panelState.cloud.kind).toBe('error');
    expect(readCloudLocal(local)?.pending?.requestId).toBe(calls[0].requestId);
    await coordinator.retry();
    expect(calls[1]).toEqual(calls[0]);
    expect(readCloudLocal(local)?.pending).toBeNull();
    expect(coordinator.panelState.cloud.kind).toBe('saved');
  });

  it('keeps newer local edits dirty when an older snapshot is acknowledged', async () => {
    const local = storage(); const binding = new CloudLocalStore(local, locks()); const draft = bridge();
    let complete!: (value: { ok: true; value: CloudPlanRecord }) => void;
    const create = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const client = { create } as unknown as CloudPlanClient;
    const coordinator = new CloudPlanCoordinator(client, binding, draft.adapter, () => {}, true);
    const saving = coordinator.save();
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    const changed = cloudPlanDocumentExample(); changed.input.openingCashCents = 800000;
    draft.change(changed);
    complete({ ok: true, value: record() });
    await saving;
    expect(coordinator.panelState.hasUnsentChanges).toBe(true);
    expect(coordinator.panelState.cloud.kind).toBe('dirty');
  });

  it('does not mark equivalent documents dirty due to key order or absent optional fields', async () => {
    const standard = cloudPlanDocumentExample();
    standard.input.commonEvents[0].actual = undefined;
    const reordered: CloudPlanDocument = { selectedId: standard.selectedId, input: standard.input, schemaVersion: 1 };
    const local = storage(); const binding = new CloudLocalStore(local, locks()); const draft = bridge(reordered);
    const client = { create: vi.fn(async () => ({ ok: true as const, value: record() })) } as unknown as CloudPlanClient;
    const coordinator = new CloudPlanCoordinator(client, binding, draft.adapter, () => {}, true);
    await coordinator.save();
    expect(coordinator.panelState.cloud.kind).toBe('saved');
    expect(coordinator.panelState.hasUnsentChanges).toBe(false);
  });

  it('keeps local data on conflict and never retries a stale revision automatically', async () => {
    const local = storage(); const binding = new CloudLocalStore(local, locks()); const draft = bridge();
    const initial = record();
    await binding.write({ access: { planId: initial.planId, secret: generateCloudSecret() },
      metadata: { planId: initial.planId, revision: 1, savedAt: initial.savedAt, expiresAt: initial.expiresAt },
      acknowledged: initial.document }, null);
    const changed = cloudPlanDocumentExample(); changed.input.openingCashCents = 700000;
    draft.change(changed);
    const client = { update: vi.fn(async () => ({ ok: false as const,
      error: { code: 'REVISION_CONFLICT' as const, status: 409 as const, currentRevision: 2 } })) } as unknown as CloudPlanClient;
    const coordinator = new CloudPlanCoordinator(client, binding, draft.adapter, () => {}, true);
    await coordinator.save();
    expect(coordinator.panelState.cloud).toEqual({ kind: 'conflict', currentRevision: 2 });
    expect(readCloudLocal(local)?.pending).toBeNull();
    await coordinator.retry();
    expect(client.update).toHaveBeenCalledTimes(1);
    expect(draft.adapter.completeDocument()?.input.openingCashCents).toBe(700000);
  });

  it('does not send a request when private-key storage fails', async () => {
    const local = storage();
    local.setItem = () => { throw new Error('Quota exceeded'); };
    const binding = new CloudLocalStore(local, locks()); const draft = bridge();
    const client = { create: vi.fn() } as unknown as CloudPlanClient;
    const coordinator = new CloudPlanCoordinator(client, binding, draft.adapter, () => {}, true);
    await coordinator.save();
    expect(client.create).not.toHaveBeenCalled();
    expect(coordinator.panelState.cannotSaveReason).toMatch(/private key/);
    expect(local.data.has(CLOUD_LOCAL_KEY)).toBe(false);
  });

  it('stages a link without replacing local data, then applies it only after an explicit choice', async () => {
    const local = storage(); const binding = new CloudLocalStore(local, locks()); const draft = bridge();
    const access = { planId: record().planId, secret: generateCloudSecret() };
    const client = { load: vi.fn(async () => ({ ok: true as const, value: record() })) } as unknown as CloudPlanClient;
    const coordinator = new CloudPlanCoordinator(client, binding, draft.adapter, () => {}, true);
    await coordinator.open(access);
    expect(draft.adapter.replaceWith).not.toHaveBeenCalled();
    expect(readCloudLocal(local)).toBeNull();
    expect(coordinator.panelState.cloud.kind).toBe('conflict');
    await coordinator.loadServerVersion();
    expect(draft.adapter.replaceWith).toHaveBeenCalledOnce();
    expect(readCloudLocal(local)?.binding?.access).toEqual(access);
  });

  it('does not replace edits made while the server version is loading', async () => {
    const local = storage(); const binding = new CloudLocalStore(local, locks()); const draft = bridge();
    const initial = record();
    const access = { planId: initial.planId, secret: generateCloudSecret() };
    await binding.write({ access, metadata: { planId: initial.planId, revision: 1,
      savedAt: initial.savedAt, expiresAt: initial.expiresAt }, acknowledged: initial.document }, null);
    let complete!: (value: { ok: true; value: CloudPlanRecord }) => void;
    const load = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const coordinator = new CloudPlanCoordinator({ load } as unknown as CloudPlanClient, binding, draft.adapter, () => {}, true);
    const loading = coordinator.loadServerVersion();
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    const changed = cloudPlanDocumentExample(); changed.input.openingCashCents = 800000;
    draft.change(changed);
    complete({ ok: true, value: initial });
    await loading;
    expect(draft.adapter.replaceWith).not.toHaveBeenCalled();
    expect(draft.adapter.completeDocument()?.input.openingCashCents).toBe(800000);
  });

  it('blocks a stale tab from overwriting a newer cloud binding', async () => {
    const local = storage(); const lock = locks();
    const a = new CloudLocalStore(local, lock); const b = new CloudLocalStore(local, lock);
    await a.write(null, null);
    await expect(b.write(null, null)).rejects.toThrow(/another tab/);
    expect(readCloudLocal(local)?.localRevision).toBe(1);
  });
});
