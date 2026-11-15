import type { MoveInput, PlanResult, TimelineRow } from '../../domain/types';
import { addDays } from '../../domain/engine';
import { money } from '../../shared/format';

/** Rows worth a reminder: unpaid planned payments and expected paydays from the engine timeline. */
export function reminderRows(plan: PlanResult, asOf: string): TimelineRow[] {
  return plan.timeline.filter(row => !row.isActual && row.date >= asOf
    && (row.kind === 'expense' || row.kind === 'refundable-deposit' || row.kind === 'income'));
}

const text = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (date: string) => date.replace(/-/g, '');
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 folds lines longer than 75 octets; continuation lines start with a space. */
function fold(line: string) {
  const bytes = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    if (bytes.encode(current + char).length > (parts.length ? 74 : 75)) { parts.push(current); current = ''; }
    current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** An all-day calendar event per payment, each with a reminder the day before. Nothing is sent anywhere. */
export function planCalendar(input: MoveInput, plan: PlanResult, asOf: string, now = new Date()): string {
  const housing = input.housingOptions.find(h => h.id === plan.housingId)?.label ?? 'Housing';
  const moving = input.movingOptions.find(m => m.id === plan.movingId)?.label ?? 'Moving';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MoveGap//Moving payment plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(`MoveGap · ${housing} · ${moving}`)}`];
  for (const row of reminderRows(plan, asOf)) {
    const income = row.kind === 'income';
    const summary = income ? `Payday: ${row.label} +${money(row.effectiveAmountCents)}` : `Pay ${row.label} ${money(row.effectiveAmountCents)}`;
    const detail = `${income ? 'Expected income' : row.kind === 'refundable-deposit' ? 'Refundable deposit due' : 'Payment due'} in your MoveGap plan. `
      + `Planned cash after this: ${money(row.balanceCents)}. Lowest point in the plan: ${money(plan.minBalanceCents)}. `
      + `After it happens, record the actual amount in MoveGap so your forecast stays right.`;
    lines.push('BEGIN:VEVENT', `UID:${text(`${row.eventId}-${row.date}`)}@movegap`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${day(row.date)}`, `DTEND;VALUE=DATE:${day(addDays(row.date, 1))}`,
      `SUMMARY:${text(summary)}`, `DESCRIPTION:${text(detail)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(`Tomorrow: ${summary}`)}`, 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
