import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cloudPlanDocumentExample } from '../../src/contracts/cloudPlan.examples';
import { calculatePlans } from '../../src/domain/engine';
import { CloudPlanService, hash } from './service';
import { createTestDatabase } from './testDatabase';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let service: CloudPlanService;
const key = () => randomBytes(32).toString('hex');
beforeAll(async () => { database = await createTestDatabase(); service = new CloudPlanService(database.db); });
afterAll(async () => { await database?.close(); });
async function create() {
  const secret = key(), request = { requestId: randomUUID(), document: cloudPlanDocumentExample() };
  return { secret, request, record: await service.create(secret, request) };
}

describe('PostgreSQL cloud persistence', () => {
  it('restores actual payments from another service instance; only hashes are stored', async () => {
    const { secret, record } = await create();
    const loaded = await new CloudPlanService(database.db).load(record.planId, secret);
    expect(loaded).toEqual(record);
    expect(calculatePlans(loaded.document.input).plans.find(p => p.id === loaded.document.selectedId)?.endingBalanceCents).toBe(35000);
    const row = (await database.db.query('SELECT * FROM movegap_cloud.plans WHERE id=$1', [record.planId])).rows[0];
    expect(row.key_hash).toBe(hash(secret));
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(loaded.expiresAt).toBe(new Date(Date.parse(loaded.savedAt) + 90 * 86400000).toISOString());
  });
  it('does not reveal a real plan with missing/wrong credentials', async () => {
    const { record } = await create();
    await expect(service.load(record.planId, key())).rejects.toMatchObject({ detail: { code: 'NOT_FOUND' } });
    await expect(service.load(randomUUID(), key())).rejects.toMatchObject({ detail: { code: 'NOT_FOUND' } });
  });
  it('replays a lost create response and rejects a changed payload or a reused key', async () => {
    const { secret, request, record } = await create();
    expect(await service.create(secret, request)).toEqual(record);
    const changed = structuredClone(request); changed.document.input.openingCashCents++;
    await expect(service.create(secret, changed)).rejects.toMatchObject({ detail: { code: 'REQUEST_ID_REUSED' } });
    await expect(service.create(secret, { ...request, requestId: randomUUID() })).rejects.toMatchObject({ detail: { code: 'REQUEST_ID_REUSED' } });
  });
  it('serializes concurrent creates with the same key and request ID', async () => {
    const secret = key(), request = { requestId: randomUUID(), document: cloudPlanDocumentExample() };
    const results = await Promise.all([service.create(secret, request), new CloudPlanService(database.db).create(secret, request)]);
    expect(results[0]).toEqual(results[1]);
    expect((await database.db.query('SELECT id FROM movegap_cloud.plans WHERE key_hash=$1', [hash(secret)])).rows).toHaveLength(1);
  });
  it('allows only one of two writers on the same revision, without losing the winning update', async () => {
    const { secret, record } = await create();
    const first = cloudPlanDocumentExample(), second = cloudPlanDocumentExample();
    first.input.openingCashCents = 700000; second.input.openingCashCents = 800000;
    const attempts = await Promise.allSettled([
      service.update(record.planId, secret, { requestId: randomUUID(), expectedRevision: 1, document: first }),
      new CloudPlanService(database.db).update(record.planId, secret, { requestId: randomUUID(), expectedRevision: 1, document: second }),
    ]);
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failed = attempts.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason.detail).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
    const succeeded = attempts.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof service.update>>>;
    expect(await service.load(record.planId, secret)).toEqual(succeeded.value);
  });
  it('replays the original update after later revisions without overwriting the latest state', async () => {
    const { secret, record } = await create();
    const request = { requestId: randomUUID(), expectedRevision: 1, document: cloudPlanDocumentExample() };
    const first = await service.update(record.planId, secret, request);
    const changed = cloudPlanDocumentExample(); changed.input.openingCashCents = 900000;
    await service.update(record.planId, secret, { requestId: randomUUID(), expectedRevision: 2, document: changed });
    expect(await service.update(record.planId, secret, request)).toEqual(first);
    expect((await service.load(record.planId, secret)).revision).toBe(3);
    expect((await service.load(record.planId, secret)).document.input.openingCashCents).toBe(900000);
  });
  it('rotates access atomically and limits old credentials to the exact metadata receipt', async () => {
    const { secret, request: createRequest, record } = await create();
    const nextSecret = key(), request = { requestId: randomUUID(), expectedRevision: 1 };
    const rotated = await service.rotateKey(record.planId, secret, nextSecret, request);
    expect(rotated.revision).toBe(2); expect(rotated.savedAt).toBe(record.savedAt);
    expect(rotated).not.toHaveProperty('document');
    expect(await service.rotateKey(record.planId, secret, nextSecret, request)).toEqual(rotated);
    await expect(service.load(record.planId, secret)).rejects.toMatchObject({ detail: { code: 'NOT_FOUND' } });
    await expect(service.update(record.planId, secret, { ...request, document: record.document })).rejects.toMatchObject({ detail: { code: 'NOT_FOUND' } });
    await expect(service.create(secret, createRequest)).rejects.toMatchObject({ detail: { code: 'REQUEST_ID_REUSED' } });
    expect((await service.load(record.planId, nextSecret)).document).toEqual(record.document);
  });
  it('deletes financial data and old replay payloads, while preserving a deletion receipt', async () => {
    const { secret, record } = await create();
    const request = { requestId: randomUUID(), expectedRevision: 1 };
    const deleted = await service.remove(record.planId, secret, request);
    expect(await service.remove(record.planId, secret, request)).toEqual(deleted);
    await expect(service.load(record.planId, secret)).rejects.toMatchObject({ detail: { code: 'NOT_FOUND' } });
    const receipts = (await database.db.query<{ value: object }>('SELECT value FROM movegap_cloud.receipts WHERE plan_id=$1', [record.planId])).rows;
    expect(receipts).toHaveLength(1); expect(receipts[0].value).not.toHaveProperty('document');
    expect((await database.db.query('SELECT id FROM movegap_cloud.plans WHERE id=$1', [record.planId])).rows).toHaveLength(0);
  });
  it('expires plans without extending their life on reads and purges expired financial data', async () => {
    const { secret, record } = await create();
    expect((await service.load(record.planId, secret)).expiresAt).toBe(record.expiresAt);
    await database.db.query("UPDATE movegap_cloud.plans SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [record.planId]);
    await expect(service.load(record.planId, secret)).rejects.toMatchObject({ detail: { code: 'NOT_FOUND' } });
    await service.cleanup();
    expect((await database.db.query('SELECT id FROM movegap_cloud.plans WHERE id=$1', [record.planId])).rows).toHaveLength(0);
    expect((await database.db.query('SELECT value FROM movegap_cloud.receipts WHERE plan_id=$1', [record.planId])).rows).toHaveLength(0);
  });
  it('shares rate limits between service instances', async () => {
    const bucket = `test:${randomUUID()}`;
    await service.rateLimit(bucket, 3600, 1);
    await expect(new CloudPlanService(database.db).rateLimit(bucket, 3600, 1)).rejects.toMatchObject({ detail: { code: 'RATE_LIMITED', retryAfterSeconds: 3600 } });
  });
});
