import { addDays } from '../../domain/engine';
import { getPaymentHistory } from '../../domain/payments';
import type { MoveInput, PaymentEvent } from '../../domain/types';
import { validDate, validMoney } from './inputHelpers';

export type Frequency = 'weekly' | 'biweekly' | 'monthly';
export interface SeriesDraft { label: string; amountCents: number; firstDate: string; lastDate: string; frequency: Frequency; kind: 'income' | 'expense'; confirmed: boolean }
export function seriesPreview(input: MoveInput, draft: SeriesDraft) {
  if (!draft.label.trim() || draft.label.trim().length > 120) throw new Error('Enter a payment name up to 120 characters.');
  if (!validMoney(draft.amountCents)) throw new Error('Enter a valid amount from $0 to $10,000,000.');
  if (!validDate(input.startDate) || !validDate(draft.firstDate) || !validDate(draft.lastDate)
    || draft.firstDate < input.startDate || draft.lastDate > addDays(input.startDate, 59) || draft.firstDate > draft.lastDate) throw new Error('Keep the first and last dates inside your 60-day window, in that order.');
  if (!['weekly', 'biweekly', 'monthly'].includes(draft.frequency) || !['expense', 'income'].includes(draft.kind)) throw new Error('Choose a valid frequency and payment type.');
  const dates: string[] = [];
  const anchor = new Date(`${draft.firstDate}T00:00:00Z`);
  for (let i = 0; i < 60; i++) {
    let date: string;
    if (draft.frequency === 'monthly') {
      const target = new Date(anchor); target.setUTCDate(1); target.setUTCMonth(anchor.getUTCMonth() + i);
      const last = new Date(target); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
      target.setUTCDate(Math.min(anchor.getUTCDate(), last.getUTCDate())); date = target.toISOString().slice(0, 10);
    } else date = addDays(draft.firstDate, i * (draft.frequency === 'weekly' ? 7 : 14));
    if (date > draft.lastDate) break;
    dates.push(date);
  }
  const existing = input.commonEvents;
  const rows = dates.map(date => ({ date, duplicate: existing.some(e => e.label.trim().toLowerCase() === draft.label.trim().toLowerCase()
    && e.date === date && e.kind === draft.kind && e.amountCents === draft.amountCents) }));
  const added = rows.filter(row => !row.duplicate).length;
  if (getPaymentHistory(input).length + added > 300) throw new Error('This series would exceed the 300-payment limit. Shorten it first.');
  return { rows, added, skipped: rows.length - added, totalCents: added * draft.amountCents };
}

/** Rechecks the current draft at commit time; repeating the same operation is idempotent. */
export function addSeries(input: MoveInput, draft: SeriesDraft): MoveInput {
  const preview = seriesPreview(input, draft);
  const events: PaymentEvent[] = preview.rows.filter(row => !row.duplicate).map(row => ({ id: crypto.randomUUID(), date: row.date,
    label: draft.label.trim(), amountCents: draft.amountCents, kind: draft.kind, confirmation: draft.confirmed ? 'confirmed' : 'proposed' }));
  return { ...input, commonEvents: [...input.commonEvents, ...events] };
}

/** Copies proposed obligations, never actual transactions. Original history is untouched. */
export function copyOption(input: MoveInput, kind: 'housing' | 'moving', id: string): MoveInput {
  const options = kind === 'housing' ? input.housingOptions : input.movingOptions;
  const source = options.find(option => option.id === id);
  if (!source || options.length >= 3) throw new Error('You can keep up to three options of each type.');
  if (getPaymentHistory(input).length + source.events.length > 300) throw new Error('Copying would exceed the 300-payment limit.');
  const copy = { ...source, id: crypto.randomUUID(), label: `${source.label.slice(0, 106)} (copy)`, confirmation: 'proposed' as const,
    events: source.events.map(event => ({ id: crypto.randomUUID(), label: event.label, date: event.date,
      amountCents: event.amountCents, kind: event.kind, confirmation: 'proposed' as const })) };
  return kind === 'housing' ? { ...input, housingOptions: [...input.housingOptions, copy as typeof input.housingOptions[number]] }
    : { ...input, movingOptions: [...input.movingOptions, copy as typeof input.movingOptions[number]] };
}
