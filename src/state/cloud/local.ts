import type { CloudPlanAccess, CloudPlanDocument, CloudPlanMetadata, CloudPlanOperation } from '../../contracts/cloudPlan';
import { parseCloudDocument, parseMetadata, SECRET, UUID } from './validation';

export const CLOUD_LOCAL_KEY = 'movegap.cloud.binding.v1';
export const CLOUD_PREVIOUS_PREFIX = 'movegap.cloud.previous.v1.';
const MAX_LOCAL_BYTES = 600_000;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export interface CloudBinding {
  access: CloudPlanAccess;
  metadata: CloudPlanMetadata;
  acknowledged: CloudPlanDocument;
}
export interface CloudPending {
  operation: CloudPlanOperation;
  requestId: string;
  startedAt: string;
  /** Immutable snapshot for create/update; new edits cannot change the in-flight request. */
  document?: CloudPlanDocument;
  /** Generated and persisted before create/rotate. */
  secret?: string;
  expectedRevision?: number;
}
export interface CloudLocalState {
  version: 1;
  localRevision: number;
  tabId: string;
  binding: CloudBinding | null;
  pending: CloudPending | null;
}

export function generateCloudSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function privateLink(access: CloudPlanAccess, origin: string = location.href): string {
  if (!UUID.test(access.planId) || !SECRET.test(access.secret)) throw new Error('Invalid private link credentials.');
  const url = new URL(origin);
  return `${url.origin}${url.pathname}#/restore/${access.planId}/${access.secret}`;
}

export function parsePrivateLink(link: string, origin: string = location.href): CloudPlanAccess | null {
  try {
    const current = new URL(origin);
    const url = new URL(link, current);
    if (url.origin !== current.origin || url.pathname !== current.pathname || url.search) return null;
    const match = /^#\/restore\/([0-9a-f-]{36})\/([0-9a-f]{64})$/.exec(url.hash);
    return match && UUID.test(match[1]) ? { planId: match[1], secret: match[2] } : null;
  } catch { return null; }
}

/** Capture only our fragment, then remove the secret from browser history before any load. */
export function consumeRestoreFragment(browserLocation: Location = location, browserHistory: History = history): CloudPlanAccess | null {
  const access = parsePrivateLink(browserLocation.href, browserLocation.origin + browserLocation.pathname);
  if (access) browserHistory.replaceState(browserHistory.state, '', `${browserLocation.pathname}${browserLocation.search}#/overview`);
  return access;
}

export function parseCloudLocal(raw: string): CloudLocalState {
  if (raw.length > MAX_LOCAL_BYTES) throw new Error('Cloud binding is too large.');
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.localRevision)
    || (value.localRevision as number) < 1 || typeof value.tabId !== 'string'
    || !value.tabId || (value.binding !== null && !object(value.binding))
    || (value.pending !== null && !object(value.pending))) throw new Error('Cloud binding is invalid.');
  if (value.binding) {
    const binding = value.binding as Record<string, unknown>;
    if (!object(binding.access) || typeof binding.access.planId !== 'string' || !UUID.test(binding.access.planId)
      || typeof binding.access.secret !== 'string' || !SECRET.test(binding.access.secret)) throw new Error('Cloud binding is invalid.');
    const metadata = parseMetadata(binding.metadata);
    if (metadata.planId !== binding.access.planId) throw new Error('Cloud binding is invalid.');
    parseCloudDocument(binding.acknowledged);
  }
  if (value.pending) {
    const pending = value.pending as Record<string, unknown>;
    if (!['create', 'update', 'remove', 'rotate-key'].includes(String(pending.operation))
      || typeof pending.requestId !== 'string' || !UUID.test(pending.requestId)
      || typeof pending.startedAt !== 'string' || Number.isNaN(Date.parse(pending.startedAt)))
      throw new Error('Pending cloud request is invalid.');
    if (pending.operation === 'create' || pending.operation === 'update') parseCloudDocument(pending.document);
    if (pending.operation === 'create' || pending.operation === 'rotate-key') {
      if (typeof pending.secret !== 'string' || !SECRET.test(pending.secret)) throw new Error('Pending cloud key is invalid.');
    }
    if (pending.operation !== 'create' && (!Number.isSafeInteger(pending.expectedRevision)
      || (pending.expectedRevision as number) < 1 || !value.binding)) throw new Error('Pending cloud revision is invalid.');
    if (pending.operation === 'create' && value.binding) throw new Error('Pending create cannot replace an existing binding.');
  }
  return value as unknown as CloudLocalState;
}

export function readCloudLocal(storage: Pick<Storage, 'getItem'>): CloudLocalState | null {
  const raw = storage.getItem(CLOUD_LOCAL_KEY);
  return raw === null ? null : parseCloudLocal(raw);
}

/** All mutations compare localRevision while holding an origin-wide Web Lock. */
export class CloudLocalStore {
  readonly tabId = crypto.randomUUID();
  private revision = 0;
  state: CloudLocalState | null;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>, private readonly locks: Pick<LockManager, 'request'> | undefined) {
    this.state = readCloudLocal(storage);
    this.revision = this.state?.localRevision ?? 0;
  }

  async write(binding: CloudBinding | null, pending: CloudPending | null): Promise<CloudLocalState> {
    if (!this.locks) throw new Error('Web Locks are required for safe cloud binding changes.');
    return this.locks.request(CLOUD_LOCAL_KEY, { mode: 'exclusive' }, async () => {
      const latest = readCloudLocal(this.storage);
      if ((latest?.localRevision ?? 0) !== this.revision) throw new Error('Cloud binding changed in another tab.');
      const next: CloudLocalState = { version: 1, localRevision: this.revision + 1, tabId: this.tabId, binding, pending };
      const raw = JSON.stringify(next);
      parseCloudLocal(raw);
      this.storage.setItem(CLOUD_LOCAL_KEY, raw);
      this.state = next;
      this.revision = next.localRevision;
      return next;
    });
  }

  refresh(): CloudLocalState | null {
    const latest = readCloudLocal(this.storage);
    this.state = latest;
    this.revision = latest?.localRevision ?? 0;
    return latest;
  }

  /** Keep access to the prior server plan before binding a different link. */
  archiveCurrent(): string | null {
    const binding = this.state?.binding;
    if (!binding) return null;
    const key = `${CLOUD_PREVIOUS_PREFIX}${Date.now()}.${crypto.randomUUID()}`;
    this.storage.setItem(key, JSON.stringify(binding));
    return key;
  }
}
