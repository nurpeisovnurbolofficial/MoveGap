import { addDays, calculatePlans } from './engine';
import { getPaymentHistory } from './payments';
import type { MoveInput, PaymentEvent, PlanResult } from './types';

export interface PaymentWindow { eventId: string; earliest: string; latest: string; feeCents: number; feeDate: string }
export interface AdjustmentRequest { planId: string; windows: PaymentWindow[]; maxChanges: 1 | 2; maxFeeCents: number }
export interface PaymentChange { eventId: string; label: string; from: string; to: string; feeCents: number; feeDate: string }
export interface Adjustment { changes: PaymentChange[]; feeCents: number; daysMoved: number; plan: PlanResult }
const dateValid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const moneyValid = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000;

export function adjustablePayments(input: MoveInput, plan: PlanResult): PaymentEvent[] {
  // A linked or actually paid obligation must not be rescheduled or charged again.
  return [...input.commonEvents, ...(input.housingOptions.find(h => h.id === plan.housingId)?.events ?? []),
    ...(input.movingOptions.find(m => m.id === plan.movingId)?.events ?? [])]
    .filter(e => !e.actual && (e.kind === 'expense' || e.kind === 'refundable-deposit')
      && !Object.values(e.actualLinks ?? {}).includes('same-payment') && e.date >= input.startDate && e.date <= addDays(input.startDate, 59));
}

/** Keeps identifiers and every actual unchanged; only explicitly selected deadlines change. */
export function applyAdjustment(input: MoveInput, adjustment: Adjustment): MoveInput {
  const plan = calculatePlans(input).plans.find(p => p.id === adjustment.plan.id);
  if (!plan) throw new Error('This plan is no longer available. Search again.');
  const allowed = adjustablePayments(input, plan);
  if (!adjustment.changes.length || adjustment.changes.length > 2 || new Set(adjustment.changes.map(c => c.eventId)).size !== adjustment.changes.length) throw new Error('Invalid set of payment changes.');
  const end = addDays(input.startDate, 59);
  for (const change of adjustment.changes) {
    if (!allowed.some(e => e.id === change.eventId && e.date === change.from) || !dateValid(change.to) || change.to < input.startDate || change.to > end
      || !moneyValid(change.feeCents) || (change.feeCents > 0 && (!dateValid(change.feeDate) || change.feeDate < input.startDate || change.feeDate > end))) throw new Error('The payments or dates changed. Search again.');
  }
  return materializeChanges(input, adjustment.changes);
}

function materializeChanges(input: MoveInput, changes: PaymentChange[]): MoveInput {
  const update = (events: PaymentEvent[]) => [...events.map(e => {
    const change = changes.find(c => c.eventId === e.id);
    return change ? { ...e, date: change.to, confirmation: 'proposed' as const } : e;
  }), ...fees.filter((_, i) => events.some(e => e.id === chargedChanges[i].eventId))];
  const chargedChanges = changes.filter(c => c.feeCents > 0);
  const fees: PaymentEvent[] = chargedChanges.map(c => ({ id: crypto.randomUUID(),
    label: `Proposed rescheduling fee: ${c.label}`.slice(0, 120), date: c.feeDate, amountCents: c.feeCents, kind: 'expense', confirmation: 'proposed' }));
  if (getPaymentHistory(input).length + fees.length > 300) throw new Error('There is no room for the extra fees within the 300-payment limit.');
  // Fees follow the obligation's owner, never unrelated alternatives.
  return { ...input, commonEvents: update(input.commonEvents), housingOptions: input.housingOptions.map(h => ({ ...h, events: update(h.events) })),
    movingOptions: input.movingOptions.map(m => ({ ...m, events: update(m.events) })) };
}

export function findAdjustments(input: MoveInput, request: AdjustmentRequest): { baseline: PlanResult; candidates: Adjustment[]; tested: number } {
  const result = calculatePlans(input), baseline = result.plans.find(p => p.id === request.planId);
  if (result.errors.length || !baseline) throw new Error('Complete your move and select a compatible plan first.');
  if (!request.windows.length || request.windows.length > 2 || ![1, 2].includes(request.maxChanges) || !moneyValid(request.maxFeeCents)
    || new Set(request.windows.map(w => w.eventId)).size !== request.windows.length) throw new Error('Choose one or two different payments and a valid extra-cost limit.');
  const allowed = adjustablePayments(input, baseline), end = result.horizonEnd;
  const choices = request.windows.map(w => {
    const event = allowed.find(e => e.id === w.eventId);
    if (!event || !dateValid(w.earliest) || !dateValid(w.latest) || w.earliest < input.startDate || w.latest > end || w.earliest > w.latest
      || !moneyValid(w.feeCents) || (w.feeCents > 0 && (!dateValid(w.feeDate) || w.feeDate < input.startDate || w.feeDate > end))) throw new Error('Check each allowed date range and fee date. Only unpaid expenses within the 60-day window can change.');
    const dates = [event.date];
    for (let date = w.earliest; date <= w.latest; date = addDays(date, 1)) if (date !== event.date) dates.push(date);
    return { event, window: w, dates };
  });
  const candidates: Adjustment[] = [];
  const eventCount = getPaymentHistory(input).length;
  let tested = 0;
  const rank = (a: Adjustment, b: Adjustment) => a.plan.gapToReserveCents - b.plan.gapToReserveCents || a.changes.length - b.changes.length
    || a.feeCents - b.feeCents || a.daysMoved - b.daysMoved || b.plan.minBalanceCents - a.plan.minBalanceCents || JSON.stringify(a.changes).localeCompare(JSON.stringify(b.changes));
  for (const first of choices[0].dates) for (const second of choices[1]?.dates ?? ['']) {
    const changes: PaymentChange[] = choices.flatMap((choice, i) => {
      const to = i ? second : first;
      return to === choice.event.date ? [] : [{ eventId: choice.event.id, label: choice.event.label, from: choice.event.date, to,
        feeCents: choice.window.feeCents, feeDate: choice.window.feeDate }];
    });
    const feeCents = changes.reduce((n, c) => n + c.feeCents, 0);
    if (!changes.length || changes.length > request.maxChanges || feeCents > request.maxFeeCents) continue;
    if (eventCount + changes.filter(c => c.feeCents > 0).length > 300) continue;
    const draft: Adjustment = { changes, feeCents, daysMoved: changes.reduce((n, c) => n + Math.abs((Date.parse(c.to) - Date.parse(c.from)) / 86400000), 0), plan: baseline };
    const changed = materializeChanges(input, changes);
    const plan = calculatePlans(changed).plans.find(p => p.id === baseline.id);
    tested++;
    if (!plan || plan.gapToReserveCents >= baseline.gapToReserveCents) continue;
    candidates.push({ ...draft, plan }); candidates.sort(rank); candidates.splice(3);
  }
  return { baseline, candidates, tested };
}

export function stressAdjustment(input: MoveInput, adjustment: Adjustment, incomeId: string, delayDays: number, extraCents: number, extraDate: string): PlanResult {
  if (!Number.isInteger(delayDays) || delayDays < 0 || delayDays > 14 || !moneyValid(extraCents)
    || (extraCents > 0 && (!dateValid(extraDate) || extraDate < input.startDate || extraDate > addDays(input.startDate, 59)))) throw new Error('Check stress-test amounts and dates.');
  const changed = applyAdjustment(input, adjustment);
  const eligibleIncome = getPaymentHistory(changed).find(r => r.event.id === incomeId && r.event.kind === 'income' && !r.event.actual && r.event.confirmation === 'confirmed'
    && r.event.date >= input.startDate && r.event.date <= addDays(input.startDate, 59) && adjustment.plan.timeline.some(t => t.eventId === r.event.id));
  if (delayDays && !eligibleIncome) throw new Error('Choose a future confirmed income in this plan to test.');
  const update = (events: PaymentEvent[]) => events.map(e => e.id === eligibleIncome?.event.id && delayDays ? { ...e, date: addDays(e.date, delayDays) } : e);
  changed.commonEvents = update(changed.commonEvents);
  changed.housingOptions = changed.housingOptions.map(h => ({ ...h, events: update(h.events) }));
  changed.movingOptions = changed.movingOptions.map(m => ({ ...m, events: update(m.events) }));
  if (extraCents) changed.commonEvents.push({ id: crypto.randomUUID(), label: 'Hypothetical additional expense', date: extraDate, amountCents: extraCents, kind: 'expense', confirmation: 'proposed' });
  const result = calculatePlans(changed), plan = result.plans.find(p => p.id === adjustment.plan.id);
  if (result.errors.length || !plan) throw new Error('This stress test exceeds the valid plan limits.');
  return plan;
}
