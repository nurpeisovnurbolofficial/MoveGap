/** Shared contract v1. Money is positive integer USD cents. Dates are YYYY-MM-DD. */
export type DateOnly = string;
export type EventKind = 'income' | 'expense' | 'refundable-deposit' | 'deposit-refund';
export type Confirmation = 'confirmed' | 'proposed';

export interface PaymentEvent {
  id: string;
  label: string;
  date: DateOnly;
  amountCents: number;
  kind: EventKind;
  confirmation: Confirmation;
  /** Set BOTH fields when a payment happened. They replace, never add to, the plan. */
  actual?: { date: DateOnly; amountCents: number };
}

export interface HousingOption {
  id: string;
  label: string;
  availableFrom: DateOnly;
  confirmation: Confirmation;
  events: PaymentEvent[];
}

export interface MovingOption {
  id: string;
  label: string;
  moveDate: DateOnly;
  confirmation: Confirmation;
  events: PaymentEvent[];
}

export interface MoveInput {
  version: 1;
  startDate: DateOnly;
  openingCashCents: number;
  reserveCents: number;
  latestMoveDate: DateOnly;
  commonEvents: PaymentEvent[];
  housingOptions: HousingOption[];
  movingOptions: MovingOption[];
}

export interface TimelineRow {
  eventId: string;
  label: string;
  date: DateOnly;
  plannedDate: DateOnly;
  plannedAmountCents: number;
  effectiveAmountCents: number;
  kind: EventKind;
  isActual: boolean;
  cashChangeCents: number;
  balanceCents: number;
}

export interface PlanResult {
  id: string;
  housingId: string;
  movingId: string;
  moveDate: DateOnly;
  needsConfirmation: boolean;
  meetsReserve: boolean;
  /** Entered nonrefundable outflows inside the common 60-day window. */
  costCents: number;
  depositOutflowCents: number;
  endingBalanceCents: number;
  minBalanceCents: number;
  minBalanceDate: DateOnly;
  firstBelowZeroDate: DateOnly | null;
  firstBelowReserveDate: DateOnly | null;
  gapToZeroCents: number;
  gapToReserveCents: number;
  timeline: TimelineRow[];
  warnings: string[];
}

export interface ComparisonResult {
  errors: string[];
  horizonEnd: DateOnly;
  plans: PlanResult[];
  rejected: { housingId: string; movingId: string; reason: string }[];
  /** Recommendations use only confirmed plans that preserve the reserve. */
  cheapestPlanId: string | null;
  largestBufferPlanId: string | null;
  earliestPlanId: string | null;
}
