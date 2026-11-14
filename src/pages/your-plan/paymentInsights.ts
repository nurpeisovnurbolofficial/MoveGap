import type { PaymentEvent, PlanResult, TimelineRow } from '../../domain/types';
import { money } from '../../shared/format';

const DAY = 86_400_000;
const payment = (row: TimelineRow) => !row.isActual && row.cashChangeCents < 0
  && (row.kind === 'expense' || row.kind === 'refundable-deposit');

/** Timeline already excludes obligations covered by a linked real payment. */
export function nextUnpaidExpense(plan: PlanResult, asOf: string): { row: TimelineRow; overdueCount: number } | null {
  const unpaid = plan.timeline.filter(payment).sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId));
  const overdue = unpaid.filter(row => row.date < asOf);
  const row = overdue[0] ?? unpaid[0];
  return row ? { row, overdueCount: overdue.length } : null;
}

export function localDateToday(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function paymentDeviation(event: PaymentEvent): { amount: string; timing: string } | null {
  if (!event.actual) return null;
  const difference = event.actual.amountCents - event.amountCents;
  const subject = event.kind === 'income' ? 'Income received' : event.kind === 'deposit-refund'
    ? 'Deposit returned' : event.kind === 'refundable-deposit' ? 'Deposit paid' : 'Payment made';
  const amount = difference === 0 ? 'Same amount as planned' :
    `${subject}: ${money(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than planned`;
  const days = Math.round((Date.parse(`${event.actual.date}T00:00:00Z`) - Date.parse(`${event.date}T00:00:00Z`)) / DAY);
  const timing = days === 0 ? 'On the planned date' :
    `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ${days > 0 ? 'later' : 'earlier'} than planned`;
  return { amount, timing };
}
