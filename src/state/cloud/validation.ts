import { calculatePlans } from '../../domain/engine';
import type { MoveInput } from '../../domain/types';
import { CLOUD_PLAN_MAX_BODY_BYTES, CLOUD_PLAN_VERSION } from '../../contracts/cloudPlan';
import type { CloudPlanApiError, CloudPlanDeleted, CloudPlanDocument, CloudPlanMetadata, CloudPlanRecord, CloudPlanValidationIssue } from '../../contracts/cloudPlan';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SECRET = /^[0-9a-f]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const timestamp = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const revision = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
const event = (value: unknown): boolean => object(value) && keys(value,
  ['id', 'label', 'date', 'amountCents', 'kind', 'confirmation'], ['actual', 'actualLinks'])
  && (value.actual === undefined || (object(value.actual) && keys(value.actual, ['date', 'amountCents'])))
  && (value.actualLinks === undefined || (object(value.actualLinks) && Object.values(value.actualLinks)
    .every(link => link === 'same-payment' || link === 'separate-payment')));

export function parseCloudDocument(value: unknown): CloudPlanDocument {
  if (!object(value) || !keys(value, ['schemaVersion', 'input', 'selectedId'])
    || value.schemaVersion !== CLOUD_PLAN_VERSION || !object(value.input)) throw new Error('Invalid cloud document.');
  const input = value.input;
  if (!keys(input, ['version', 'startDate', 'openingCashCents', 'reserveCents', 'latestMoveDate', 'commonEvents', 'housingOptions', 'movingOptions'])
    || !Array.isArray(input.commonEvents) || !input.commonEvents.every(event)
    || !Array.isArray(input.housingOptions) || !input.housingOptions.every(option => object(option)
      && keys(option, ['id', 'label', 'availableFrom', 'confirmation', 'events'])
      && Array.isArray(option.events) && option.events.every(event))
    || !Array.isArray(input.movingOptions) || !input.movingOptions.every(option => object(option)
      && keys(option, ['id', 'label', 'moveDate', 'confirmation', 'events'])
      && Array.isArray(option.events) && option.events.every(event))
    || (value.selectedId !== null && typeof value.selectedId !== 'string')) throw new Error('Invalid cloud document.');
  const document = value as unknown as CloudPlanDocument;
  const result = calculatePlans(document.input as MoveInput);
  if (result.errors.length || (document.selectedId && !result.plans.some(plan => plan.id === document.selectedId)))
    throw new Error('Invalid cloud document.');
  if (new TextEncoder().encode(JSON.stringify(document)).length > CLOUD_PLAN_MAX_BODY_BYTES)
    throw new Error('Cloud document is too large.');
  return document;
}

export function parseMetadata(value: unknown): CloudPlanMetadata {
  if (!object(value) || !keys(value, ['planId', 'revision', 'savedAt', 'expiresAt'])
    || typeof value.planId !== 'string' || !UUID.test(value.planId)
    || !revision(value.revision) || !timestamp(value.savedAt) || !timestamp(value.expiresAt))
    throw new Error('Invalid cloud metadata.');
  return value as unknown as CloudPlanMetadata;
}

export function parseRecord(value: unknown): CloudPlanRecord {
  if (!object(value) || !keys(value, ['planId', 'revision', 'savedAt', 'expiresAt', 'document']))
    throw new Error('Invalid cloud record.');
  const metadata = parseMetadata({ planId: value.planId, revision: value.revision, savedAt: value.savedAt, expiresAt: value.expiresAt });
  return { ...metadata, document: parseCloudDocument(value.document) };
}

export function parseDeleted(value: unknown): CloudPlanDeleted {
  if (!object(value) || !keys(value, ['planId', 'revision', 'deletedAt'])
    || typeof value.planId !== 'string' || !UUID.test(value.planId)
    || !revision(value.revision) || !timestamp(value.deletedAt)) throw new Error('Invalid delete receipt.');
  return value as unknown as CloudPlanDeleted;
}

/** Do not expose server-provided messages or rejected values to the UI. */
export function parseApiError(status: number, value: unknown): CloudPlanApiError | null {
  if (!object(value) || typeof value.code !== 'string') return null;
  const code = value.code;
  if (status === 400 && code === 'BAD_REQUEST') return { code, status };
  if (status === 404 && code === 'NOT_FOUND') return { code, status };
  if (status === 409 && code === 'REQUEST_ID_REUSED') return { code, status };
  if (status === 409 && code === 'REVISION_CONFLICT' && revision(value.currentRevision))
    return { code, status, currentRevision: value.currentRevision as number };
  if (status === 413 && code === 'PAYLOAD_TOO_LARGE') return { code, status };
  if (status === 422 && code === 'INVALID_DOCUMENT' && Array.isArray(value.issues)
    && value.issues.every(issue => object(issue) && typeof issue.path === 'string'
      && ['REQUIRED', 'INVALID_TYPE', 'INVALID_VALUE', 'UNSUPPORTED_VERSION', 'UNKNOWN_FIELD', 'INVALID_REFERENCE'].includes(String(issue.code))))
    return { code, status, issues: (value.issues as CloudPlanValidationIssue[])
      .map(issue => ({ path: issue.path, code: issue.code })) };
  if (status === 429 && code === 'RATE_LIMITED' && Number.isSafeInteger(value.retryAfterSeconds)
    && (value.retryAfterSeconds as number) >= 0) return { code, status, retryAfterSeconds: value.retryAfterSeconds as number };
  if (status === 503 && code === 'UNAVAILABLE') return { code, status };
  if (status === 500 && code === 'INTERNAL_ERROR') return { code, status };
  return null;
}
