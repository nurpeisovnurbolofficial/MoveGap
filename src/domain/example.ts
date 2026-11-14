import type { MoveInput, PaymentEvent } from './types';

const event = (id: string, label: string, date: string, dollars: number, kind: PaymentEvent['kind'] = 'expense'): PaymentEvent =>
  ({ id, label, date, amountCents: Math.round(dollars * 100), kind, confirmation: 'confirmed' });

/** Fictional inputs, never hardcoded outputs. Clone before editing. */
export function createExample(): MoveInput {
  return {
    version: 1, startDate: '2026-11-14', openingCashCents: 450000,
    reserveCents: 50000, latestMoveDate: '2026-12-04',
    commonEvents: [
      event('application', 'Application fee', '2026-11-17', 100),
      event('old-rent', 'Old rent', '2026-12-01', 1700),
      event('payday', 'Take-home pay', '2026-12-03', 2400, 'income'),
      { ...event('refund', 'Expected old deposit', '2026-12-20', 1400, 'deposit-refund'), confirmation: 'proposed' },
    ],
    housingOptions: [
      { id: 'home-early', label: 'Original payment schedule', availableFrom: '2026-11-25', confirmation: 'confirmed',
        events: [event('deposit-early', 'New refundable deposit', '2026-11-20', 1600, 'refundable-deposit'),
          event('rent-early', 'New rent', '2026-12-01', 1550)] },
      { id: 'home-later', label: 'Agreed December 4 schedule', availableFrom: '2026-12-04', confirmation: 'confirmed',
        events: [event('deposit-later', 'New refundable deposit', '2026-11-20', 1600, 'refundable-deposit'),
          event('rent-later', 'New rent', '2026-12-04', 1550)] },
    ],
    movingOptions: [
      { id: 'mover-early', label: 'November 25 move', moveDate: '2026-11-25', confirmation: 'confirmed',
        events: [event('truck-early', 'Moving service', '2026-11-25', 700)] },
      { id: 'mover-later', label: 'December 4 move', moveDate: '2026-12-04', confirmation: 'confirmed',
        events: [event('truck-later', 'Moving service', '2026-12-04', 700)] },
    ],
  };
}
