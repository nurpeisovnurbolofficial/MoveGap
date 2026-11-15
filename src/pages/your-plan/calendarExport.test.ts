import { describe, expect, it } from 'vitest';
import { calculatePlans } from '../../domain/engine';
import { createExample } from '../../domain/example';
import { planCalendar, reminderRows } from './calendarExport';

describe('calendar reminders from the selected plan', () => {
  const input = createExample();
  const plan = calculatePlans(input).plans[2];
  const ics = planCalendar(input, plan, '2026-11-14', new Date('2026-11-15T06:00:00Z'));

  it('creates one all-day event with a day-before reminder for every unpaid payment and payday', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    const rows = reminderRows(plan, '2026-11-14');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(rows.length);
    expect((ics.match(/TRIGGER:-P1D/g) ?? []).length).toBe(rows.length);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202');
    expect(ics.replace(/\r\n /g, '')).toContain(String.raw`SUMMARY:Pay Old rent $1\,700`);
    expect(ics.replace(/\r\n /g, '')).toContain(String.raw`SUMMARY:Payday: Take-home pay +$2\,400`);
    expect(ics).not.toContain('Expected old deposit');
  });

  it('leaves out payments already recorded or before today, and folds long lines', () => {
    expect(reminderRows(plan, '2026-12-02').every(row => row.date >= '2026-12-02')).toBe(true);
    const recorded = createExample();
    recorded.commonEvents[0].actual = { date: '2026-11-17', amountCents: 10000 };
    const after = calculatePlans(recorded).plans[2];
    expect(reminderRows(after, '2026-11-14').some(row => row.label === 'Application fee')).toBe(false);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('keeps the same event identity after rescheduling or changing the amount', () => {
    const changed = createExample();
    const rent = changed.commonEvents.find(event => event.id === 'old-rent')!;
    rent.date = '2026-12-02'; rent.amountCents = 180000;
    const updated = planCalendar(changed, calculatePlans(changed).plans[2], '2026-11-14', new Date('2026-11-16T06:00:00Z'));
    const event = (file: string) => file.replace(/\r\n /g, '').split('BEGIN:VEVENT').find(block => block.includes('UID:old-rent@movegap'))!;
    expect(event(ics)).toBeTruthy();
    expect(event(updated)).toContain('DTSTART;VALUE=DATE:20261202');
    expect(event(updated)).toContain(String.raw`SUMMARY:Pay Old rent $1\,800`);
    expect(event(updated)).toContain('LAST-MODIFIED:20261116T060000Z');
    expect(updated).not.toContain('UID:old-rent-2026');
  });
});
