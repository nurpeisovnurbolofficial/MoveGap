import { describe, expect, it } from 'vitest';
import { calculatePlans } from '../domain/engine';
import { parseSnapshot } from '../state/storage';
import { cloudPlanDocumentExample, cloudPlanWireExamples } from './cloudPlan.examples';
import type { CloudPlanDocument } from './cloudPlan';

describe('cloud document compatibility with the existing financial model', () => {
  it('round-trips actuals and cross-option relationships without changing the cash result', () => {
    const document: CloudPlanDocument = JSON.parse(JSON.stringify(cloudPlanDocumentExample()));
    const result = calculatePlans(document.input);
    expect(result.errors).toEqual([]);
    const selected = result.plans.find(plan => plan.id === document.selectedId)!;
    expect(selected.endingBalanceCents).toBe(35000);
    expect(selected.timeline.filter(row => row.eventId === 'truck-early')).toHaveLength(1);
    expect(selected.needsConfirmation).toBe(false);
    expect(document.input.movingOptions[1].events[0].actualLinks).toEqual({ 'truck-early': 'separate-payment' });
  });

  it('can restore a completed cloud document through the existing v1 snapshot boundary', () => {
    const response = cloudPlanWireExamples().loaded;
    const restored = parseSnapshot(JSON.stringify({ ...response.value.document, savedAt: response.value.savedAt }));
    expect(restored.input).toEqual(response.value.document.input);
    expect(restored.selectedId).toBe(response.value.document.selectedId);
  });

  it('does not require choosing an option for a complete input snapshot', () => {
    const document = { ...cloudPlanDocumentExample(), selectedId: null };
    const restored = parseSnapshot(JSON.stringify({ input: document.input, selectedId: document.selectedId, savedAt: '2026-11-15T00:00:00.000Z' }));
    expect(restored.selectedId).toBeNull();
    expect(calculatePlans(restored.input).errors).toEqual([]);
  });
});
