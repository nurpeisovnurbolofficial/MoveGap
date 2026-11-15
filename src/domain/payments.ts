import type { MoveInput, PaymentEvent, PaymentHistoryEntry, PaymentOwner } from './types';

/** All input events, including actuals outside a selected plan or its forecast window. */
export function getPaymentHistory(input: MoveInput): PaymentHistoryEntry[] {
  const end = Date.parse(`${input.startDate}T00:00:00Z`) + 59 * 86_400_000;
  const entry = (event: PaymentEvent, owner: PaymentOwner, ownerLabel: string): PaymentHistoryEntry => {
    const effectiveDate = event.actual?.date ?? event.date;
    const exclusion = event.kind === 'deposit-refund' && !event.actual ? 'expected-refund'
      : event.kind === 'income' && event.confirmation === 'proposed' && !event.actual ? 'unconfirmed-income'
      : effectiveDate < input.startDate ? 'before-start'
      : Date.parse(`${effectiveDate}T00:00:00Z`) > end ? 'after-window' : null;
    return { event, owner, ownerLabel, effectiveDate, exclusion };
  };
  return [
    ...input.commonEvents.map(e => entry(e, { kind: 'common' }, 'Shared payments')),
    ...input.housingOptions.flatMap(h => h.events.map(e => entry(e, { kind: 'housing', id: h.id }, h.label))),
    ...input.movingOptions.flatMap(m => m.events.map(e => entry(e, { kind: 'moving', id: m.id }, m.label))),
  ];
}

/** Plausible overlap is a question for the user, not an automatic identity match. */
export function getActualCandidates(input: MoveInput, owner: PaymentOwner, event: PaymentEvent, history = getPaymentHistory(input)): PaymentHistoryEntry[] {
  return history.filter(row => row.event.id !== event.id && row.event.kind === event.kind
    && (event.actualLinks?.[row.event.id] !== undefined || (row.event.actual && owner.kind !== 'common'
      && row.owner.kind === owner.kind && 'id' in row.owner && row.owner.id !== owner.id)));
}

export function paymentRemovalReason(input: MoveInput, ids: string[]): string | null {
  const entries = getPaymentHistory(input);
  if (entries.some(row => ids.includes(row.event.id) && row.event.actual)) {
    return 'Recorded payments must stay in your history. Only clear an actual if it was entered by mistake; clearing a record is not a refund.';
  }
  if (entries.some(row => !ids.includes(row.event.id) && Object.keys(row.event.actualLinks ?? {}).some(id => ids.includes(id)))) {
    return 'Another payment refers to this entry. Review and remove that relationship before deleting it.';
  }
  return null;
}
