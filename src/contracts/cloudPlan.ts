import type { MoveInput } from '../domain/types';

/**
 * Cloud contract v1 — specification only; no API or database is connected here.
 * Provider-neutral, JSON-only payloads. Dates/timestamps use UTC ISO strings;
 * money and actual/actualLinks keep the existing MoveInput v1 semantics.
 * Never put incomplete editor state, access keys, demo access or computed plans
 * inside CloudPlanDocument. Validate untrusted JSON at BOTH transport boundaries;
 * TypeScript types do not provide runtime validation.
 */
export const CLOUD_PLAN_VERSION = 1 as const;
export const CLOUD_PLAN_MAX_BODY_BYTES = 256 * 1024;
export const CLOUD_PLAN_RETENTION_DAYS = 90;

/** Path parameters are opaque server-generated UUIDs, never access keys. */
export const CLOUD_PLAN_ROUTES = {
  create: { method: 'POST', path: '/api/cloud-plans' },
  load: { method: 'GET', path: '/api/cloud-plans/:planId' },
  update: { method: 'PUT', path: '/api/cloud-plans/:planId' },
  remove: { method: 'DELETE', path: '/api/cloud-plans/:planId' },
  rotateKey: { method: 'POST', path: '/api/cloud-plans/:planId/rotate-key' },
} as const;

export interface CloudPlanDocument {
  schemaVersion: typeof CLOUD_PLAN_VERSION;
  input: MoveInput;
  /** Null is valid: a complete input may be saved before choosing an option. */
  selectedId: string | null;
}

/** Server-authoritative metadata. Revision starts at 1 and increases per mutation. */
export interface CloudPlanMetadata {
  planId: string;
  revision: number;
  savedAt: string;
  expiresAt: string;
}

export interface CloudPlanRecord extends CloudPlanMetadata {
  document: CloudPlanDocument;
}

/** Sensitive client credential: NEVER include it in document/UI status/logs. */
export interface CloudPlanAccess {
  planId: string;
  secret: string;
}

export interface CreateCloudPlanRequest {
  requestId: string;
  document: CloudPlanDocument;
}

export interface CloudPlanMutationRequest {
  /** UUID generated once per user action; reuse unchanged after an uncertain result. */
  requestId: string;
  /** Positive safe integer; compare and change in ONE database transaction. */
  expectedRevision: number;
}

export interface UpdateCloudPlanRequest extends CloudPlanMutationRequest {
  document: CloudPlanDocument;
}

export type RemoveCloudPlanRequest = CloudPlanMutationRequest;
export type RotateCloudPlanKeyRequest = CloudPlanMutationRequest;

export interface CloudPlanDeleted {
  planId: string;
  revision: number;
  deletedAt: string;
}

/** Fixed error codes; messages must not echo financial data, keys or raw input. */
export type CloudPlanApiError =
  | { code: 'BAD_REQUEST'; status: 400 }
  // Same response for missing/deleted/expired plan and missing/invalid key.
  | { code: 'NOT_FOUND'; status: 404 }
  // Only return this after authentication. Fetch latest separately; retain local edits.
  | { code: 'REVISION_CONFLICT'; status: 409; currentRevision: number }
  | { code: 'REQUEST_ID_REUSED'; status: 409 }
  | { code: 'PAYLOAD_TOO_LARGE'; status: 413 }
  | { code: 'INVALID_DOCUMENT'; status: 422; issues: CloudPlanValidationIssue[] }
  | { code: 'RATE_LIMITED'; status: 429; retryAfterSeconds: number }
  | { code: 'UNAVAILABLE'; status: 503 }
  | { code: 'INTERNAL_ERROR'; status: 500 };

export interface CloudPlanValidationIssue {
  /** E.g. input.commonEvents[0].amountCents, never the rejected field value. */
  path: string;
  code: 'REQUIRED' | 'INVALID_TYPE' | 'INVALID_VALUE' | 'UNSUPPORTED_VERSION'
    | 'UNKNOWN_FIELD' | 'INVALID_REFERENCE';
}

/** HTTP success: 201 for create, 200 for other operations, including remove. */
export type CloudPlanApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CloudPlanApiError };

/** Browser failures are not JSON responses from the API. A timeout is NOT a failed write. */
export interface CloudPlanTransportError {
  code: 'NETWORK_ERROR' | 'ABORTED' | 'INVALID_RESPONSE';
  /** For a mutation, unknown means it may have committed; reuse its requestId. */
  outcome: 'not-sent' | 'unknown';
}

export type CloudPlanClientResult<T> = CloudPlanApiResult<T>
  | { ok: false; error: CloudPlanTransportError };

/** Sasha implements this transport; tests may inject an explicitly named fake. */
export interface CloudPlanClient {
  create(secret: string, request: CreateCloudPlanRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanRecord>>;
  load(access: CloudPlanAccess, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanRecord>>;
  update(access: CloudPlanAccess, request: UpdateCloudPlanRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanRecord>>;
  remove(access: CloudPlanAccess, request: RemoveCloudPlanRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanDeleted>>;
  rotateKey(access: CloudPlanAccess, nextSecret: string, request: RotateCloudPlanKeyRequest, signal?: AbortSignal): Promise<CloudPlanClientResult<CloudPlanMetadata>>;
}

export type CloudPlanOperation = 'create' | 'update' | 'remove' | 'rotate-key';
export type CloudPlanStatus =
  | { kind: 'disabled' }
  | { kind: 'local-only' }
  | { kind: 'loading' }
  | { kind: 'saving'; operation: CloudPlanOperation }
  | { kind: 'saved' }
  | { kind: 'dirty' }
  | { kind: 'conflict'; currentRevision: number }
  | { kind: 'error'; error: CloudPlanApiError | CloudPlanTransportError };

export type LocalPlanSaveStatus =
  | { kind: 'unsaved' }
  | { kind: 'saving' }
  | { kind: 'saved'; savedAt: string }
  | { kind: 'error' };

/**
 * Aruzhan renders these props; Sasha supplies state; Nurbol connects App.
 * No fetch, localStorage, key generation or cash-flow logic in the panel.
 * Keep lastSaved on network errors. hasUnsentChanges refers to the cloud document,
 * not an unfinished local editor. An old response cannot mark newer edits saved.
 */
export interface CloudPlanPanelState {
  local: LocalPlanSaveStatus;
  cloud: CloudPlanStatus;
  lastSaved: CloudPlanMetadata | null;
  hasUnsentChanges: boolean;
  /** Complete, validated input, usable service, no pending operation/conflict. */
  canSave: boolean;
  cannotSaveReason: string | null;
  /** Only revealed on explicit request/manual-copy fallback. Never auto-link or log. */
  privateLink: string | null;
  copyStatus: 'idle' | 'copied' | 'failed';
}

export interface CloudPlanPanelProps {
  state: CloudPlanPanelState;
  onSave: () => void;
  /** Client parses only our origin's #/restore/<planId>/<64-lowercase-hex-key>. */
  onOpenLink: (link: string) => void;
  onCopyLink: () => void;
  onRevealLink: () => void;
  /** Preserve a local recovery copy and confirm replacement before loading. */
  onLoadServerVersion: () => void;
  onSaveLocalAsNew: () => void;
  /** Caller confirms first; deletion only removes the cloud copy. */
  onDeleteCloudCopy: () => void;
  /** Caller confirms invalidation of the old link first. */
  onRotateLink: () => void;
  /** Retry identical pending request; do not silently create a new requestId. */
  onRetry: () => void;
}

/**
 * IMPLEMENTATION RULES (part of v1):
 *
 * Authentication and lost responses:
 * - Client creates 32 random bytes using Web Crypto, encodes as 64 lowercase hex
 *   characters and durably keeps the key + requestId BEFORE create/rotate. This
 *   allows retry without storing or recovering plaintext keys on the server.
 * - Every operation uses Authorization: Bearer <secret>. Create establishes that
 *   key; subsequent calls prove access. Rotation additionally sends the new key
 *   in X-MoveGap-New-Key. Neither key goes in the URL, JSON document or response.
 * - Credentials travel only over HTTPS to the same-origin API. Restrict CORS;
 *   redact credentials and request bodies in infrastructure/error reporting too.
 * - Store key hashes only. A planId or a requestId is NEVER authorization.
 * - GET never mutates data or extends expiry. No automatic cloud creation on load.
 *
 * Validation and consistency:
 * - Body limit is UTF-8 bytes, not JS string length. Strictly validate shape,
 *   version, finite/safe integer amounts/revisions, real dates, bounded arrays,
 *   unique IDs and actualLinks before passing input to the existing engine.
 * - Document is allowed iff calculatePlans(input) has no errors and selectedId
 *   is null or names a returned plan. Zero compatible plans with null is valid.
 * - Unknown fields are rejected, never persisted as arbitrary JSON. Responses
 *   receive the same runtime validation on the client. Never mutate local data
 *   on an invalid response. No server-side recomputation needs to be stored.
 * - Create starts revision 1. Update and rotate increment by one. Create/update
 *   set savedAt and expiresAt (server now + 90 days); rotation preserves both.
 *   Delete increments once and returns a receipt, not a document. After expiry
 *   all operations reject; expiry cleanup is a required server job.
 *
 * Atomic idempotency (all mutation operations):
 * - Scope receipts to credential hash + operation + planId (except create) +
 *   requestId. Verify authentication before exposing a result. Same requestId
 *   with different validated content/revision/new-key hash => REQUEST_ID_REUSED.
 * - Exact retry returns the ORIGINAL receipt/status without applying again or
 *   extending expiry, even after later revisions. Client must not regress its
 *   acknowledged revision or clear newer local edits using an old receipt.
 * - Compare expectedRevision, write, and store receipt atomically; a replay is
 *   checked before the revision comparison. Concurrent distinct writes from
 *   one revision cannot both succeed. Receipts persist for 24 hours.
 * - After deletion/rotation, only the exact authenticated retry of that mutation
 *   may return its metadata-only receipt for 24h. The old key cannot load, write,
 *   or replay earlier create/update responses. No deleted financial payload in
 *   tombstones; old credential receipts are revoked except that narrow receipt.
 * - After 24h of uncertain outcome the client must reconcile via load (new key
 *   for rotation) or ask the user; never blindly resubmit create. A create key
 *   is unique to one plan; server rejects reuse instead of creating duplicates.
 *
 * Link and UI:
 * - Use #/restore/<planId>/<secret> on our own origin; remove sensitive fragment
 *   with replaceState once captured safely. No secrets in query, API paths,
 *   analytics, logs, screenshots or public examples. No third-party link tools.
 * - API responses: Cache-Control: no-store; site Referrer-Policy: no-referrer.
 * - Key grants READ AND WRITE, not public sharing. No signup or email recovery.
 * - Local incomplete draft survives offline/error/conflict. Never auto-merge
 *   financial changes, auto-overwrite on load, or gate data recovery behind Pass.
 * - Frontend status 'saved' means the acknowledged snapshot matches current
 *   data; transport completion alone is insufficient. Conflict actions preserve
 *   local input before load or create a distinct plan with a new key/requestId.
 */
