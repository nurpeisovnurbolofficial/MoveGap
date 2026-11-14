import type { ComparisonResult, MoveInput, PaymentEvent, PlanResult, TimelineRow } from './types';

const DAY = 86_400_000;
const MAX_CENTS = 1_000_000_000;
const isDate = (s: string) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const isMoney = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTS;
const outflow = (kind: PaymentEvent['kind']) => kind === 'expense' || kind === 'refundable-deposit';

export function validateInput(input: MoveInput): string[] {
  const errors: string[] = [];
  if (input.version !== 1) errors.push('Unsupported plan version.');
  if (!isDate(input.startDate)) errors.push('Enter a valid start date.');
  if (!isDate(input.latestMoveDate)) errors.push('Enter a valid latest move date.');
  if (!isMoney(input.openingCashCents)) errors.push('Opening cash must be nonnegative integer cents.');
  if (!isMoney(input.reserveCents)) errors.push('Reserve must be nonnegative integer cents.');
  if (input.latestMoveDate < input.startDate) errors.push('Latest move date must not precede the start.');
  if (input.housingOptions.length < 1 || input.housingOptions.length > 3) errors.push('Enter 1–3 housing options.');
  if (input.movingOptions.length < 1 || input.movingOptions.length > 3) errors.push('Enter 1–3 moving options.');
  const ids = new Set<string>();
  const checkId = (id: string) => {
    if (!id?.trim() || ids.has(id)) errors.push('Every option and event needs a unique nonempty ID.');
    ids.add(id);
  };
  const checkConfirmation = (value: string) => {
    if (!['confirmed', 'proposed'].includes(value)) errors.push('Invalid confirmation status.');
  };
  const allEvents = [...input.commonEvents];
  for (const option of input.housingOptions) {
    checkId(option.id); checkConfirmation(option.confirmation);
    if (!isDate(option.availableFrom)) errors.push(`${option.label}: invalid availability date.`);
    allEvents.push(...option.events);
  }
  for (const option of input.movingOptions) {
    checkId(option.id); checkConfirmation(option.confirmation);
    if (!isDate(option.moveDate)) errors.push(`${option.label}: invalid move date.`);
    if (isDate(input.startDate) && isDate(option.moveDate)
      && (option.moveDate < input.startDate || option.moveDate > addDays(input.startDate, 59))) {
      errors.push(`${option.label}: move must be inside the 60-day window.`);
    }
    allEvents.push(...option.events);
  }
  if (allEvents.length > 300) errors.push('Keep this plan to at most 300 payment events.');
  for (const event of allEvents) {
    checkId(event.id); checkConfirmation(event.confirmation);
    if (!event.label?.trim()) errors.push('Every event needs a label.');
    if (!isDate(event.date) || !isMoney(event.amountCents)) errors.push(`${event.label}: invalid date or amount.`);
    if (!['income', 'expense', 'refundable-deposit', 'deposit-refund'].includes(event.kind)) errors.push('Invalid event kind.');
    if (event.actual && (!isDate(event.actual.date) || !isMoney(event.actual.amountCents))) errors.push(`${event.label}: invalid actual payment.`);
  }
  return [...new Set(errors)];
}

export function calculatePlans(input: MoveInput): ComparisonResult {
  const errors = validateInput(input);
  const result: ComparisonResult = {
    errors, horizonEnd: isDate(input.startDate) ? addDays(input.startDate, 59) : '',
    plans: [], rejected: [], cheapestPlanId: null, largestBufferPlanId: null, earliestPlanId: null,
  };
  if (errors.length) return result;
  for (const housing of input.housingOptions) for (const moving of input.movingOptions) {
    if (moving.moveDate < housing.availableFrom || moving.moveDate > input.latestMoveDate) {
      result.rejected.push({ housingId: housing.id, movingId: moving.id,
        reason: moving.moveDate < housing.availableFrom ? 'New home is not available on this move date.' : 'Move is after your latest allowed date.' });
      continue;
    }
    const warnings: string[] = [];
    let needsConfirmation = housing.confirmation === 'proposed' || moving.confirmation === 'proposed';
    const events = [...input.commonEvents, ...housing.events, ...moving.events].filter(event => {
      if (event.kind === 'deposit-refund' && !event.actual) {
        warnings.push(`${event.label}: expected refund excluded until received.`); return false;
      }
      if (event.kind === 'income' && event.confirmation === 'proposed' && !event.actual) {
        warnings.push(`${event.label}: unconfirmed income excluded.`); return false;
      }
      const date = event.actual?.date ?? event.date;
      if (date < input.startDate) {
        warnings.push(`${event.label}: before opening date; assumed reflected in opening cash.`); return false;
      }
      if (date > result.horizonEnd) {
        warnings.push(`${event.label}: outside the 60-day window; excluded.`); return false;
      }
      if (event.confirmation === 'proposed' && !event.actual) needsConfirmation = true;
      return true;
    }).sort((a, b) => (a.actual?.date ?? a.date).localeCompare(b.actual?.date ?? b.date)
      || Number(outflow(b.kind)) - Number(outflow(a.kind)) || a.id.localeCompare(b.id));
    let balance = input.openingCashCents;
    let minBalance = balance;
    let minDate = input.startDate;
    let firstZero: string | null = balance < 0 ? input.startDate : null;
    let firstReserve: string | null = balance < input.reserveCents ? input.startDate : null;
    let cost = 0;
    let deposits = 0;
    const timeline: TimelineRow[] = [];
    for (const event of events) {
      const amount = event.actual?.amountCents ?? event.amountCents;
      const date = event.actual?.date ?? event.date;
      const change = outflow(event.kind) ? -amount : amount;
      balance += change;
      if (event.kind === 'expense') cost += amount;
      if (event.kind === 'refundable-deposit') deposits += amount;
      if (balance < minBalance) { minBalance = balance; minDate = date; }
      if (balance < 0 && firstZero === null) firstZero = date;
      if (balance < input.reserveCents && firstReserve === null) firstReserve = date;
      timeline.push({ eventId: event.id, label: event.label, date, plannedDate: event.date,
        plannedAmountCents: event.amountCents, effectiveAmountCents: amount, kind: event.kind,
        isActual: Boolean(event.actual), cashChangeCents: change, balanceCents: balance });
    }
    result.plans.push({ id: JSON.stringify([housing.id, moving.id]), housingId: housing.id,
      movingId: moving.id, moveDate: moving.moveDate, needsConfirmation,
      meetsReserve: minBalance >= input.reserveCents, costCents: cost,
      depositOutflowCents: deposits, endingBalanceCents: balance, minBalanceCents: minBalance,
      minBalanceDate: minDate, firstBelowZeroDate: firstZero, firstBelowReserveDate: firstReserve,
      gapToZeroCents: Math.max(0, -minBalance), gapToReserveCents: Math.max(0, input.reserveCents - minBalance), timeline, warnings });
  }
  const eligible = result.plans.filter(p => p.meetsReserve && !p.needsConfirmation);
  const tie = (a: PlanResult, b: PlanResult) => a.id.localeCompare(b.id);
  result.cheapestPlanId = [...eligible].sort((a,b) => a.costCents-b.costCents || tie(a,b))[0]?.id ?? null;
  result.largestBufferPlanId = [...eligible].sort((a,b) => b.minBalanceCents-a.minBalanceCents || tie(a,b))[0]?.id ?? null;
  result.earliestPlanId = [...eligible].sort((a,b) => a.moveDate.localeCompare(b.moveDate) || tie(a,b))[0]?.id ?? null;
  return result;
}
