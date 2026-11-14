import type { ComparisonResult, MoveInput, PlanResult, TimelineRow } from '../../domain/types';

/**
 * Read-only views over engine results. Nothing here calculates balances:
 * every amount comes from `calculatePlans`, these helpers only pick rows out.
 */

export type MoneyStatus = 'fits' | 'reserve' | 'short';
export type Tone = MoneyStatus | 'confirm';

export function moneyStatus(plan: PlanResult): MoneyStatus {
  if (plan.meetsReserve) return 'fits';
  return plan.firstBelowZeroDate ? 'short' : 'reserve';
}

export function toneOf(plan: PlanResult): Tone {
  const status = moneyStatus(plan);
  return plan.needsConfirmation && status === 'fits' ? 'confirm' : status;
}

export const isEligible = (plan: PlanResult) => plan.meetsReserve && !plan.needsConfirmation;

export function planOptions(plan: PlanResult, input: MoveInput) {
  return {
    housing: input.housingOptions.find(h => h.id === plan.housingId),
    moving: input.movingOptions.find(m => m.id === plan.movingId),
  };
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Index of the timeline row where the engine found the lowest balance, or -1 if it is the opening cash. */
export function lowestIndex(plan: PlanResult) {
  return plan.timeline.findIndex(row => row.date === plan.minBalanceDate && row.balanceCents === plan.minBalanceCents);
}

export interface CriticalDay {
  date: string;
  /** Balance before the first payment of that day (from the previous timeline row). */
  startBalanceCents: number;
  /** Payments on that day, up to and including the lowest point. */
  rows: TimelineRow[];
  nextIncome: TimelineRow | null;
  lowestIsOpening: boolean;
}

export function criticalDay(plan: PlanResult, input: MoveInput): CriticalDay {
  const index = lowestIndex(plan);
  if (index < 0) {
    return { date: plan.minBalanceDate, startBalanceCents: input.openingCashCents, rows: [],
      nextIncome: plan.timeline.find(row => row.cashChangeCents > 0) ?? null, lowestIsOpening: true };
  }
  let first = index;
  while (first > 0 && plan.timeline[first - 1].date === plan.minBalanceDate) first--;
  return {
    date: plan.minBalanceDate,
    startBalanceCents: first > 0 ? plan.timeline[first - 1].balanceCents : input.openingCashCents,
    rows: plan.timeline.slice(first, index + 1),
    nextIncome: plan.timeline.slice(index + 1).find(row => row.cashChangeCents > 0) ?? null,
    lowestIsOpening: false,
  };
}

/** Timeline rows that belong to this plan's housing and moving options (not shared payments). */
export function optionRows(plan: PlanResult, input: MoveInput) {
  const { housing, moving } = planOptions(plan, input);
  const ids = new Set([...(housing?.events ?? []), ...(moving?.events ?? [])].map(event => event.id));
  return plan.timeline.filter(row => ids.has(row.eventId));
}

/** Names of the terms that keep this plan from being a confirmed recommendation. */
export function unconfirmedItems(plan: PlanResult, input: MoveInput) {
  const { housing, moving } = planOptions(plan, input);
  const items: string[] = [];
  if (housing?.confirmation === 'proposed') items.push(`${housing.label} (housing terms)`);
  if (moving?.confirmation === 'proposed') items.push(`${moving.label} (moving terms)`);
  const events = [...input.commonEvents, ...(housing?.events ?? []), ...(moving?.events ?? [])];
  for (const row of plan.timeline) {
    const event = events.find(e => e.id === row.eventId);
    if (event?.confirmation === 'proposed' && !event.actual) items.push(row.label);
  }
  return [...new Set(items)];
}

export type HighlightKey = 'earliest' | 'cheapest' | 'buffer';
export interface Highlight {
  key: HighlightKey;
  label: string;
  /** The engine's pick first, then any eligible plan with exactly the same value. */
  winnerIds: string[];
}

export const highlightLabels: Record<HighlightKey, string> = {
  earliest: 'Earliest move',
  cheapest: 'Lowest cost',
  buffer: 'Most cash left',
};

/** Wraps the engine's recommendation IDs and reports honest ties instead of hiding them. */
export function highlights(result: ComparisonResult) {
  const eligible = result.plans.filter(isEligible);
  const find = (id: string | null) => result.plans.find(p => p.id === id);
  const items: Highlight[] = [];
  const add = (key: HighlightKey, id: string | null, same: (a: PlanResult, b: PlanResult) => boolean) => {
    const pick = find(id);
    if (!pick) return;
    items.push({ key, label: highlightLabels[key], winnerIds: [pick.id, ...eligible.filter(p => p.id !== pick.id && same(p, pick)).map(p => p.id)] });
  };
  add('earliest', result.earliestPlanId, (a, b) => a.moveDate === b.moveDate);
  add('cheapest', result.cheapestPlanId, (a, b) => a.costCents === b.costCents);
  add('buffer', result.largestBufferPlanId, (a, b) => a.minBalanceCents === b.minBalanceCents);
  const single = items.length === 3 && items.every(item => item.winnerIds.length === 1 && item.winnerIds[0] === items[0].winnerIds[0]);
  return { eligible, items, bestFitId: single ? items[0].winnerIds[0] : null };
}

/** When nothing fits: the plan whose lowest balance is highest (first in engine order on a tie). */
export function closestPlan(result: ComparisonResult) {
  return [...result.plans].sort((a, b) => b.minBalanceCents - a.minBalanceCents)[0];
}
