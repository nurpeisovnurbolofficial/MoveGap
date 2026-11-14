import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { cloudPlanDocumentExample } from '../../src/contracts/cloudPlan.examples';
import { CLOUD_PLAN_MAX_BODY_BYTES } from '../../src/contracts/cloudPlan';
import { createCloudHandler, handleCleanup } from './http';
import { CloudPlanService } from './service';
import { createTestDatabase } from './testDatabase';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let handle: ReturnType<typeof createCloudHandler>;
const secret = randomBytes(32).toString('hex');
const rateKey = randomBytes(32).toString('hex');
let address = '';
beforeEach(() => { address = randomUUID(); });
afterEach(() => { vi.unstubAllEnvs(); });
const document = () => cloudPlanDocumentExample();
beforeAll(async () => {
  database = await createTestDatabase();
  handle = createCloudHandler({ service: () => new CloudPlanService(database.db), rateLimitSecret: () => rateKey,
    clientAddress: () => address });
});
afterAll(async () => { await database?.close(); });
function req(path = '', method = 'POST', body: unknown = { requestId: randomUUID(), document: document() }, headers: Record<string, string> = {}) {
  return new Request(`https://movegap.test/api/cloud-plans${path}`, { method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...headers },
    ...(method !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

describe('cloud HTTP boundary', () => {
  it('handles create/load/update/conflict/rotate/delete with no credential in JSON', async () => {
    const response = await handle(req()); expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const created = await response.json(); const path = `/${created.value.planId}`;
    expect(created.value.document).toEqual(document()); expect(JSON.stringify(created)).not.toContain(secret);
    expect((await handle(req(path, 'GET'))).status).toBe(200);
    expect((await handle(req(`${path}?planId=${created.value.planId}`, 'GET'))).status).toBe(200);
    expect((await handle(req(`${path}?planId=${randomUUID()}`, 'GET'))).status).toBe(404);
    expect((await handle(req(`${path}?planId=${created.value.planId}&planId=${created.value.planId}`, 'GET'))).status).toBe(404);
    expect((await handle(req(`${path}?planId=${created.value.planId}&secret=hidden`, 'GET'))).status).toBe(404);
    const update = { requestId: randomUUID(), expectedRevision: 1, document: document() };
    expect((await handle(req(path, 'PUT', update))).status).toBe(200);
    expect((await handle(req(path, 'PUT', { ...update, requestId: randomUUID() }))).status).toBe(409);
    const next = randomBytes(32).toString('hex');
    expect((await handle(req(`${path}/rotate-key`, 'POST', { requestId: randomUUID(), expectedRevision: 2 }, { 'X-MoveGap-New-Key': next }))).status).toBe(200);
    expect((await handle(req(path, 'GET'))).status).toBe(404);
    expect((await handle(req(path, 'DELETE', { requestId: randomUUID(), expectedRevision: 3 }, { Authorization: `Bearer ${next}` }))).status).toBe(200);
  });
  it('rejects missing authentication, cross-origin access and keys in query strings', async () => {
    expect((await handle(req('', 'POST', {}, { Authorization: '' }))).status).toBe(404);
    expect((await handle(req('', 'POST', {}, { Origin: 'https://attacker.test' }))).status).toBe(404);
    expect((await handle(req('?secret=hidden'))).status).toBe(404);
  });
  it('rejects malformed JSON and wrong content types without echoing the body', async () => {
    const response = await handle(req('', 'POST', 'not JSON private text'));
    expect(response.status).toBe(400); expect(await response.text()).not.toContain('private text');
    expect((await handle(req('', 'POST', {}, { 'Content-Type': 'text/plain' }))).status).toBe(400);
  });
  it('limits actual body bytes even without a Content-Length header', async () => {
    const response = await handle(req('', 'POST', 'x'.repeat(CLOUD_PLAN_MAX_BODY_BYTES + 1)));
    expect(response.status).toBe(413);
  });
  it.each(['negative-money', 'invalid-date', 'unknown-field', 'duplicate-id', 'bad-link', 'missing-selection', 'unsafe-map-key'])('rejects invalid documents: %s', async kind => {
    const data = document();
    if (kind === 'negative-money') data.input.openingCashCents = -1;
    if (kind === 'invalid-date') data.input.startDate = '2026-02-30';
    if (kind === 'unknown-field') Object.assign(data, { secret: 'DO_NOT_ECHO_THIS' });
    if (kind === 'duplicate-id') data.input.commonEvents[0].id = data.input.commonEvents[1].id;
    if (kind === 'bad-link') data.input.movingOptions[1].events[0].actualLinks = { missing: 'same-payment' };
    if (kind === 'missing-selection') data.selectedId = 'not-a-plan';
    if (kind === 'unsafe-map-key') data.input.movingOptions[0].events[0].id = 'constructor';
    const response = await handle(req('', 'POST', { requestId: randomUUID(), document: data }));
    expect(response.status).toBe(422); expect(await response.text()).not.toContain('DO_NOT_ECHO_THIS');
  });
  it('fails closed when the server has no rate-limit secret or database', async () => {
    const unavailable = createCloudHandler({ service: () => { throw new Error('db secret must not leak'); }, rateLimitSecret: () => undefined, clientAddress: () => 'local' });
    const response = await unavailable(req()); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('db secret');
  });
  it('returns a shared creation quota and Retry-After without trusting a spoofed forwarding header', async () => {
    const service = new CloudPlanService(database.db);
    const limited = createCloudHandler({ service: () => service, rateLimitSecret: () => rateKey, clientAddress: () => address });
    for (let i = 0; i < 10; i++) {
      // Invalid requests still consume quota; they must not bypass abuse protection.
      expect((await limited(req('', 'POST', {}, { 'X-Forwarded-For': `fake-${i}` }))).status).toBe(422);
    }
    const response = await limited(req());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3600');
    expect((await response.json()).error.code).toBe('RATE_LIMITED');
  });
  it('does not expose the cleanup operation without its separate secret', async () => {
    vi.stubEnv('CRON_SECRET', 'a'.repeat(32));
    expect((await handleCleanup(new Request('https://movegap.test/api/cloud-cleanup'))).status).toBe(404);
    const response = await handleCleanup(new Request('https://movegap.test/api/cloud-cleanup', {
      headers: { Authorization: `Bearer ${'é'.repeat(32)}` },
    }));
    expect(response.status).toBe(404);
  });
});
