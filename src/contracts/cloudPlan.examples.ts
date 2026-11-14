import { createExample } from '../domain/example';
import type {
  CloudPlanDocument, CloudPlanMetadata, CloudPlanPanelProps, CloudPlanPanelState,
  CloudPlanApiResult, CloudPlanRecord, CreateCloudPlanRequest, UpdateCloudPlanRequest,
} from './cloudPlan';

/** Fictional, deterministic handoff data. NOT a mock API or proof of a cloud save. */
export function cloudPlanDocumentExample(): CloudPlanDocument {
  const input = createExample();
  input.movingOptions[0].events[0].actual = { date: '2026-11-25', amountCents: 90000 };
  input.movingOptions[1].events[0].actualLinks = { 'truck-early': 'separate-payment' };
  return { schemaVersion: 1, input, selectedId: JSON.stringify(['home-later', 'mover-later']) };
}

const metadata: CloudPlanMetadata = {
  planId: '00000000-0000-4000-8000-000000000001',
  revision: 1,
  savedAt: '2026-11-15T00:00:00.000Z',
  expiresAt: '2027-02-13T00:00:00.000Z',
};

export function cloudPlanWireExamples() {
  const document = cloudPlanDocumentExample();
  return {
    create: { requestId: '00000000-0000-4000-8000-000000000002', document } satisfies CreateCloudPlanRequest,
    update: { requestId: '00000000-0000-4000-8000-000000000003', expectedRevision: 1, document } satisfies UpdateCloudPlanRequest,
    loaded: { ok: true, value: { ...metadata, document } } satisfies CloudPlanApiResult<CloudPlanRecord>,
    conflict: { ok: false, error: { code: 'REVISION_CONFLICT', status: 409, currentRevision: 2 } } satisfies CloudPlanApiResult<CloudPlanRecord>,
    missing: { ok: false, error: { code: 'NOT_FOUND', status: 404 } } satisfies CloudPlanApiResult<CloudPlanRecord>,
  };
}

/** UI fixtures for A4; use in local development/tests only, never as live state. */
export function cloudPlanPanelExamples(): Record<string, CloudPlanPanelState> {
  const local = { kind: 'saved', savedAt: metadata.savedAt } as const;
  const base: CloudPlanPanelState = {
    local, cloud: { kind: 'local-only' }, lastSaved: null, hasUnsentChanges: true,
    canSave: true, cannotSaveReason: null, privateLink: null, copyStatus: 'idle',
  };
  return {
    localOnly: base,
    disabled: { ...base, cloud: { kind: 'disabled' }, canSave: false, cannotSaveReason: 'Online saving is not connected yet.' },
    incomplete: { ...base, canSave: false, cannotSaveReason: 'Complete your move details before saving online.' },
    saving: { ...base, cloud: { kind: 'saving', operation: 'create' }, canSave: false, cannotSaveReason: 'Saving online…' },
    saved: { ...base, cloud: { kind: 'saved' }, lastSaved: metadata, hasUnsentChanges: false },
    dirty: { ...base, cloud: { kind: 'dirty' }, lastSaved: metadata },
    loading: { ...base, cloud: { kind: 'loading' }, canSave: false, cannotSaveReason: 'Opening the saved plan…' },
    conflict: { ...base, cloud: { kind: 'conflict', currentRevision: 2 }, lastSaved: metadata, canSave: false, cannotSaveReason: 'Review both versions first.' },
    offline: { ...base, cloud: { kind: 'error', error: { code: 'NETWORK_ERROR', outcome: 'not-sent' } }, lastSaved: metadata, canSave: false, cannotSaveReason: 'Offline. Your local copy is still available.' },
    uncertainWrite: { ...base, cloud: { kind: 'error', error: { code: 'NETWORK_ERROR', outcome: 'unknown' } }, canSave: false, cannotSaveReason: 'The save may have completed. Retry the same request.' },
    unavailableLink: { ...base, cloud: { kind: 'error', error: { code: 'NOT_FOUND', status: 404 } }, canSave: false, cannotSaveReason: 'This link is unavailable. Your current local plan has been kept.' },
    localFailure: { ...base, local: { kind: 'error' } },
  };
}

/** Compile-checked callback surface; receives real handlers, never creates no-op saves. */
export function cloudPlanPanelExampleProps(
  callbacks: Omit<CloudPlanPanelProps, 'state'>,
): CloudPlanPanelProps {
  return { state: cloudPlanPanelExamples().localOnly, ...callbacks };
}
