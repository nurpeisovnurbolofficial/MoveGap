import { CLOUD_PLAN_MAX_BODY_BYTES, CLOUD_PLAN_ROUTES } from '../../contracts/cloudPlan';
import type {
  CloudPlanAccess, CloudPlanClient, CloudPlanClientResult, CloudPlanDeleted, CloudPlanMetadata,
  CloudPlanRecord, CloudPlanValidationIssue, CreateCloudPlanRequest, RemoveCloudPlanRequest, RotateCloudPlanKeyRequest, UpdateCloudPlanRequest,
} from '../../contracts/cloudPlan';
import { parseApiError, parseCloudDocument, parseDeleted, parseMetadata, parseRecord, SECRET, UUID } from './validation';

const badRequest = { ok: false, error: { code: 'BAD_REQUEST', status: 400 } } as const;
const badAccess = { ok: false, error: { code: 'NOT_FOUND', status: 404 } } as const;
const invalidDocument = { ok: false, error: { code: 'INVALID_DOCUMENT' as const, status: 422 as const, issues: [] as CloudPlanValidationIssue[] } } as const;
const tooLarge = { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', status: 413 } } as const;
const validMutation = (request: { requestId: string; expectedRevision: number }) =>
  UUID.test(request.requestId) && Number.isSafeInteger(request.expectedRevision) && request.expectedRevision > 0;

/** Same-origin HTTP transport. Localhost HTTP is permitted only for development. */
export class HttpCloudPlanClient implements CloudPlanClient {
  private readonly origin: URL;
  constructor(origin: string = location.origin, private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 15_000) {
    this.origin = new URL(origin);
    if (this.origin.protocol !== 'https:' && !(this.origin.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(this.origin.hostname)))
      throw new Error('Cloud API requires HTTPS on the same origin.');
  }

  private async send<T>(method: string, path: string, secret: string, body: unknown, successStatus: number,
    parse: (value: unknown) => T, signal?: AbortSignal, nextSecret?: string): Promise<CloudPlanClientResult<T>> {
    if (signal?.aborted) return { ok: false, error: { code: 'ABORTED', outcome: 'not-sent' } };
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    if (encoded && new TextEncoder().encode(encoded).length > CLOUD_PLAN_MAX_BODY_BYTES) return tooLarge;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${secret}`, Accept: 'application/json' };
      if (encoded !== undefined) headers['Content-Type'] = 'application/json';
      if (nextSecret) headers['X-MoveGap-New-Key'] = nextSecret;
      const response = await this.fetcher(new URL(path, this.origin), {
        method, headers, body: encoded, signal: controller.signal, credentials: 'omit',
        cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      });
      const raw = await response.text();
      if (raw.length > CLOUD_PLAN_MAX_BODY_BYTES * 2) throw new Error('Oversized response.');
      let value: unknown;
      try { value = JSON.parse(raw); } catch { throw new Error('Invalid JSON response.'); }
      if (response.status === successStatus) {
        try {
          if (!value || typeof value !== 'object' || Array.isArray(value) || !('ok' in value) || value.ok !== true || !('value' in value))
            throw new Error('Invalid success envelope.');
          return { ok: true, value: parse(value.value) };
        }
        catch { throw new Error('Invalid success response.'); }
      }
      const error = value && typeof value === 'object' && !Array.isArray(value) && 'ok' in value && value.ok === false
        && 'error' in value ? parseApiError(response.status, value.error) : null;
      return error ? { ok: false, error } : { ok: false, error: { code: 'INVALID_RESPONSE', outcome: method === 'GET' ? 'not-sent' : 'unknown' } };
    } catch (error) {
      return { ok: false, error: { code: controller.signal.aborted ? 'ABORTED' : error instanceof TypeError ? 'NETWORK_ERROR' : 'INVALID_RESPONSE',
        outcome: method === 'GET' ? 'not-sent' : 'unknown' } };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }

  create(secret: string, request: CreateCloudPlanRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanRecord>> {
    if (!SECRET.test(secret)) return Promise.resolve(badAccess);
    if (!UUID.test(request.requestId)) return Promise.resolve(badRequest);
    try { parseCloudDocument(request.document); } catch { return Promise.resolve(invalidDocument); }
    return this.send('POST', CLOUD_PLAN_ROUTES.create.path, secret, request, 201, parseRecord, signal);
  }

  load(access: CloudPlanAccess, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanRecord>> {
    if (!UUID.test(access.planId) || !SECRET.test(access.secret)) return Promise.resolve(badAccess);
    return this.send('GET', `/api/cloud-plans/${access.planId}`, access.secret, undefined, 200, parseRecord, signal);
  }

  update(access: CloudPlanAccess, request: UpdateCloudPlanRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanRecord>> {
    if (!UUID.test(access.planId) || !SECRET.test(access.secret)) return Promise.resolve(badAccess);
    if (!validMutation(request)) return Promise.resolve(badRequest);
    try { parseCloudDocument(request.document); } catch { return Promise.resolve(invalidDocument); }
    return this.send('PUT', `/api/cloud-plans/${access.planId}`, access.secret, request, 200, parseRecord, signal);
  }

  remove(access: CloudPlanAccess, request: RemoveCloudPlanRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanDeleted>> {
    if (!UUID.test(access.planId) || !SECRET.test(access.secret)) return Promise.resolve(badAccess);
    if (!validMutation(request)) return Promise.resolve(badRequest);
    return this.send('DELETE', `/api/cloud-plans/${access.planId}`, access.secret, request, 200, parseDeleted, signal);
  }

  rotateKey(access: CloudPlanAccess, nextSecret: string, request: RotateCloudPlanKeyRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanMetadata>> {
    if (!UUID.test(access.planId) || !SECRET.test(access.secret) || !SECRET.test(nextSecret) || nextSecret === access.secret)
      return Promise.resolve(badAccess);
    if (!validMutation(request)) return Promise.resolve(badRequest);
    return this.send('POST', `/api/cloud-plans/${access.planId}/rotate-key`, access.secret, request, 200, parseMetadata, signal, nextSecret);
  }
}
