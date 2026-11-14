import { z } from 'zod';
import { calculatePlans } from '../../src/domain/engine';
import type { CloudPlanDocument, CloudPlanOperation, CloudPlanValidationIssue } from '../../src/contracts/cloudPlan';
import { CloudError } from './errors';

export const uuid = z.uuid();
export const secret = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
  .refine(value => !Object.hasOwn(Object.prototype, value));
const label = z.string().min(1).max(120).refine(value => value.trim().length > 0);
const money = z.number().int().min(0).max(1_000_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
});
const confirmation = z.enum(['confirmed', 'proposed']);
const event = z.strictObject({
  id, label, date, amountCents: money,
  kind: z.enum(['income', 'expense', 'refundable-deposit', 'deposit-refund']), confirmation,
  actual: z.strictObject({ date, amountCents: money }).optional(),
  actualLinks: z.record(id, z.enum(['same-payment', 'separate-payment'])).optional(),
});
const events = z.array(event).max(300);
const documentSchema = z.strictObject({
  schemaVersion: z.literal(1), selectedId: z.string().max(600).nullable(),
  input: z.strictObject({
    version: z.literal(1), startDate: date, latestMoveDate: date,
    openingCashCents: money, reserveCents: money, commonEvents: events,
    housingOptions: z.array(z.strictObject({ id, label, availableFrom: date, confirmation, events })).min(1).max(3),
    movingOptions: z.array(z.strictObject({ id, label, moveDate: date, confirmation, events })).min(1).max(3),
  }),
});
const mutation = { requestId: uuid, expectedRevision: z.number().int().positive().max(2_147_483_646) };
const schemas = {
  create: z.strictObject({ requestId: uuid, document: documentSchema }),
  update: z.strictObject({ ...mutation, document: documentSchema }),
  remove: z.strictObject(mutation),
  'rotate-key': z.strictObject(mutation),
};

/** Reject unknown fields instead of stripping secrets into an apparently valid document. */
export function parseOperation<K extends CloudPlanOperation>(operation: K, value: unknown): z.output<typeof schemas[K]> {
  const parsed = schemas[operation].safeParse(value);
  if (!parsed.success) {
    // Never echo attacker-supplied map keys, field values, labels or Zod messages.
    const issues: CloudPlanValidationIssue[] = parsed.error.issues.slice(0, 8).map(issue => ({
      path: '$', code: issue.code === 'unrecognized_keys' ? 'UNKNOWN_FIELD' : 'INVALID_VALUE',
    }));
    throw new CloudError({ code: 'INVALID_DOCUMENT', status: 422, issues });
  }
  if ('document' in parsed.data) validateDocument(parsed.data.document);
  return parsed.data as z.output<typeof schemas[K]>;
}

export function validateDocument(document: CloudPlanDocument): void {
  const result = calculatePlans(document.input);
  if (result.errors.length || (document.selectedId !== null && !result.plans.some(plan => plan.id === document.selectedId))) {
    throw new CloudError({ code: 'INVALID_DOCUMENT', status: 422, issues: [{ path: 'document.input', code: 'INVALID_REFERENCE' }] });
  }
}
