import { addDays } from '../../domain/engine';
import type { MoveInput, PaymentEvent } from '../../domain/types';

export type PaymentOwner = { kind: 'common' } | { kind: 'housing' | 'moving'; id: string };

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function createOwnMove(startDate = localToday()): MoveInput {
  return {
    version: 1, startDate, latestMoveDate: addDays(startDate, 30),
    openingCashCents: NaN, reserveCents: 0,
    commonEvents: [], housingOptions: [], movingOptions: [],
  };
}

export function validDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time)
    && new Date(time).toISOString().slice(0, 10) === value;
}

export function validMoney(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 1_000_000_000;
}

/** Update only the intended container. Existing IDs and actual payments are preserved. */
export function putPayment(input: MoveInput, owner: PaymentOwner, event: PaymentEvent): MoveInput {
  const put = (events: PaymentEvent[]) => events.some(e => e.id === event.id)
    ? events.map(e => e.id === event.id ? event : e) : [...events, event];
  if (owner.kind === 'common') return { ...input, commonEvents: put(input.commonEvents) };
  if (owner.kind === 'housing') return { ...input, housingOptions: input.housingOptions.map(h => h.id === owner.id ? { ...h, events: put(h.events) } : h) };
  return { ...input, movingOptions: input.movingOptions.map(m => m.id === owner.id ? { ...m, events: put(m.events) } : m) };
}

export function removePayment(input: MoveInput, owner: PaymentOwner, id: string): MoveInput {
  const remove = (events: PaymentEvent[]) => events.filter(e => e.id !== id);
  if (owner.kind === 'common') return { ...input, commonEvents: remove(input.commonEvents) };
  if (owner.kind === 'housing') return { ...input, housingOptions: input.housingOptions.map(h => h.id === owner.id ? { ...h, events: remove(h.events) } : h) };
  return { ...input, movingOptions: input.movingOptions.map(m => m.id === owner.id ? { ...m, events: remove(m.events) } : m) };
}

export function paymentTimingNote(event: PaymentEvent, startDate: string): string | null {
  if (event.kind === 'deposit-refund' && !event.actual) return 'Expected return only — excluded until received.';
  if (event.kind === 'income' && event.confirmation === 'proposed' && !event.actual) return 'Unconfirmed income — excluded from cash.';
  const date = event.actual?.date ?? event.date;
  if (validDate(startDate) && validDate(date)) {
    if (date < startDate) return 'Before the start — already included in your opening cash.';
    if (date > addDays(startDate, 59)) return 'Outside the 60-day window — excluded from this forecast.';
  }
  if (event.confirmation === 'proposed' && !event.actual) return 'Unconfirmed terms — this plan remains conditional.';
  return null;
}
