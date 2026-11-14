import { addDays, calculatePlans } from '../../domain/engine';
import type { MoveInput, PaymentEvent, PlanResult } from '../../domain/types';

export function delayIncome(input: MoveInput, eventId: string, days: number): MoveInput {
  const shift = (event: PaymentEvent): PaymentEvent => event.id === eventId && event.kind === 'income' && event.confirmation === 'confirmed' && !event.actual
    ? { ...event, date: addDays(event.date, days) } : event;
  return { ...input, commonEvents: input.commonEvents.map(shift),
    housingOptions: input.housingOptions.map(option => ({ ...option, events: option.events.map(shift) })),
    movingOptions: input.movingOptions.map(option => ({ ...option, events: option.events.map(shift) })) };
}

export function delayableIncome(input: MoveInput, horizonEnd: string) {
  return [...input.commonEvents, ...input.housingOptions.flatMap(h => h.events), ...input.movingOptions.flatMap(m => m.events)]
    .filter(event => event.kind === 'income' && event.confirmation === 'confirmed' && !event.actual && event.date >= input.startDate && event.date <= horizonEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Carry forward engine balances, never recompute cash changes. Include opening cash
 * and every within-day dip so a payday cannot hide an earlier unpaid bill. */
export function calendarDays(input: MoveInput, plan: PlanResult) {
  let closing = input.openingCashCents;
  return Array.from({ length: 60 }, (_, index) => {
    const date = addDays(input.startDate, index);
    const rows = plan.timeline.filter(row => row.date === date);
    const opening = closing;
    const low = Math.min(opening, ...rows.map(row => row.balanceCents));
    closing = rows.at(-1)?.balanceCents ?? closing;
    return { date, opening, low, closing, rows };
  });
}

/** A hypothetical request, not an agreement: only a selected home's unpaid event
 * may move. The unchanged engine checks the complete alternative, including fees. */
export function paymentRequest(input: MoveInput, plan: PlanResult) {
  if (plan.meetsReserve) return null;
  const housing = input.housingOptions.find(h => h.id === plan.housingId);
  const firstProblem = plan.firstBelowReserveDate;
  if (!housing || !firstProblem) return null;
  const nextIncome = plan.timeline.find(row => row.kind === 'income' && row.cashChangeCents > 0 && row.date > firstProblem);
  if (!nextIncome) return null;
  const toDate = addDays(nextIncome.date, 1); // expenses precede income on payday
  if (toDate > addDays(input.startDate, 59)) return null;
  const candidates = housing.events.filter(event => !event.actual && (event.kind === 'expense' || event.kind === 'refundable-deposit')
    && event.amountCents > 0 && event.date >= input.startDate && event.date <= firstProblem && event.date < toDate);
  const tested = candidates.map(event => {
    const proposed: MoveInput = { ...input, housingOptions: input.housingOptions.map(h => h.id === housing.id
      ? { ...h, events: h.events.map(e => e.id === event.id ? { ...e, date: toDate, confirmation: 'proposed' } : e) } : h) };
    const after = calculatePlans(proposed).plans.find(p => p.id === plan.id);
    return after ? { event, toDate, nextIncome, after } : null;
  }).filter((request): request is NonNullable<typeof request> => request !== null && request.after.minBalanceCents > plan.minBalanceCents);
  return tested.sort((a, b) => b.after.minBalanceCents - a.after.minBalanceCents)[0] ?? null;
}
