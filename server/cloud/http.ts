import { createHmac, timingSafeEqual } from 'node:crypto';
import { CLOUD_PLAN_MAX_BODY_BYTES } from '../../src/contracts/cloudPlan.js';
import type { CloudPlanApiResult } from '../../src/contracts/cloudPlan';
import { CloudError, notFound } from './errors.js';
import { productionDatabase } from './database.js';
import { CloudPlanService } from './service.js';
import { parseOperation, secret, uuid } from './validation.js';

const responseHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
function respond(value: CloudPlanApiResult<unknown>, status = 200): Response {
  const headers: Record<string, string> = { ...responseHeaders };
  if (!value.ok && value.error.code === 'RATE_LIMITED') headers['Retry-After'] = String(value.error.retryAfterSeconds);
  return Response.json(value, { status, headers });
}
async function readBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')
    || (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity')) {
    throw new CloudError({ code: 'BAD_REQUEST', status: 400 });
  }
  const length = request.headers.get('content-length');
  if (length && Number(length) > CLOUD_PLAN_MAX_BODY_BYTES) throw new CloudError({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw new CloudError({ code: 'BAD_REQUEST', status: 400 });
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > CLOUD_PLAN_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new CloudError({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new CloudError({ code: 'BAD_REQUEST', status: 400 }); }
}

interface HttpDependencies {
  service: () => CloudPlanService;
  rateLimitSecret: () => string | undefined;
  /** Must be supplied by the trusted deployment adapter, never by JSON/cookies. */
  clientAddress: (request: Request) => string;
}

export function createCloudHandler(dependencies: HttpDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if ((request.headers.has('origin') && request.headers.get('origin') !== url.origin) || url.search) throw notFound();
      const route = /^\/api\/cloud-plans(?:\/([a-fA-F0-9-]+)(\/rotate-key)?)?\/?$/.exec(url.pathname);
      if (!route || (route[1] && !uuid.safeParse(route[1]).success)) throw notFound();
      const planId = route[1]?.toLowerCase(), rotation = Boolean(route[2]);
      const key = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1];
      if (!key) throw notFound();
      const method = request.method.toUpperCase();
      const validMethod = (!planId && method === 'POST') || (rotation && method === 'POST')
        || (planId && !rotation && ['GET', 'PUT', 'DELETE'].includes(method));
      if (!validMethod) throw new CloudError({ code: 'BAD_REQUEST', status: 400 });
      const rateSecret = dependencies.rateLimitSecret();
      if (!rateSecret || rateSecret.length < 32) throw new Error('RATE_LIMIT_NOT_CONFIGURED');
      const address = dependencies.clientAddress(request);
      const rateKey = createHmac('sha256', rateSecret).update(address).digest('hex');
      const service = dependencies.service();
      await service.rateLimit(`requests:${rateKey}`, 60, 120);
      if (!planId) {
        await service.rateLimit(`create:${rateKey}`, 3600, 10);
        await service.rateLimit('create:global', 86400, 500);
        const body = parseOperation('create', await readBody(request));
        return respond({ ok: true, value: await service.create(key, body) }, 201);
      }
      if (method === 'GET') return respond({ ok: true, value: await service.load(planId, key) });
      if (rotation) {
        const nextKey = request.headers.get('x-movegap-new-key');
        if (!secret.safeParse(nextKey).success || nextKey === key) throw new CloudError({ code: 'BAD_REQUEST', status: 400 });
        const body = parseOperation('rotate-key', await readBody(request));
        return respond({ ok: true, value: await service.rotateKey(planId, key, nextKey!, body) });
      }
      if (method === 'PUT') return respond({ ok: true, value: await service.update(planId, key, parseOperation('update', await readBody(request))) });
      return respond({ ok: true, value: await service.remove(planId, key, parseOperation('remove', await readBody(request))) });
    } catch (error) {
      if (error instanceof CloudError) return respond({ ok: false, error: error.detail }, error.detail.status);
      // No raw error/SQL/request logging: errors can contain financial data or credentials.
      return respond({ ok: false, error: { code: 'UNAVAILABLE', status: 503 } }, 503);
    }
  };
}

export const handleCloudRequest = createCloudHandler({
  service: () => new CloudPlanService(productionDatabase()),
  rateLimitSecret: () => process.env.CLOUD_RATE_LIMIT_SECRET,
  // Vercel overwrites x-vercel-forwarded-for. Never trust forwarded headers off-platform.
  clientAddress: request => process.env.VERCEL === '1'
    ? (request.headers.get('x-vercel-forwarded-for') ?? 'unknown').split(',')[0].trim() : 'local-development',
});

export async function handleCleanup(request: Request): Promise<Response> {
  const configured = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${configured ?? ''}`);
  if (request.method !== 'GET' || !configured || configured.length < 32 || supplied.length !== expected.length
    || !timingSafeEqual(supplied, expected)) return respond({ ok: false, error: { code: 'NOT_FOUND', status: 404 } }, 404);
  try {
    await new CloudPlanService(productionDatabase()).cleanup();
    return respond({ ok: true, value: { cleaned: true } });
  } catch { return respond({ ok: false, error: { code: 'UNAVAILABLE', status: 503 } }, 503); }
}
