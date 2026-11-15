import { useState } from 'react';
import type { MoveInput, PlanResult } from '../../domain/types';
import { Icon, Panel } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { localDateToday } from './paymentInsights';
import { planCalendar, reminderRows } from './calendarExport';

/** Part of Move Pass: the free demo unlocks it through the same dialog as recording actual payments. */
export function CalendarReminders({ input, plan, unlocked, onUnlock, asOf = localDateToday() }: {
  input: MoveInput; plan: PlanResult; unlocked: boolean; onUnlock: () => void; asOf?: string;
}) {
  const [message, setMessage] = useState('');
  const rows = reminderRows(plan, asOf);
  const payments = rows.filter(row => row.kind !== 'income');
  const next = payments[0];
  function download() {
    if (!unlocked) { onUnlock(); return; }
    try {
      const blob = new Blob([planCalendar(input, plan, asOf)], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `movegap-payments-${asOf}.ics`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(`Calendar file downloaded. Open it to add ${rows.length} ${rows.length === 1 ? 'date' : 'dates'} with a reminder the day before each one.`);
    } catch { setMessage('This browser could not create the calendar file. Your plan is unchanged.'); }
  }
  return <Panel title="Payment reminders" aside={<span className="count-tag">Move Pass</span>}>
    <p className="panel-intro">Add your upcoming payments and paydays to the calendar on your phone or computer. Each one gets a reminder the day before, so nothing surprises you on the tight days.</p>
    {rows.length ? <>
      <p className="calendar-reminder-summary"><strong>{payments.length} {payments.length === 1 ? 'payment' : 'payments'}</strong>{rows.length > payments.length && <> and <strong>{rows.length - payments.length} {rows.length - payments.length === 1 ? 'payday' : 'paydays'}</strong></>}{next && <> · next: {next.label} {money(next.effectiveAmountCents)} on {shortDate(next.date)}</>}</p>
      <button type="button" className="button secondary full-width" onClick={download}><Icon name="calendar" size={16}/>{unlocked ? 'Add reminders to my calendar' : 'Unlock reminders with Move Pass'}</button>
      <p className="scope-note">Works with Apple Calendar, Google Calendar and Outlook (.ics file). Recorded payments are left out. Download again after your plan changes.</p>
    </> : <p className="payment-history-empty">No upcoming unpaid payments or paydays remain in this plan.</p>}
    {message && <p role="status" className="backup-message">{message}</p>}
  </Panel>;
}
