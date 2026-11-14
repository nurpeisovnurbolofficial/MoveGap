import type {
  CloudPlanAccess, CloudPlanClient, CloudPlanClientResult, CloudPlanDocument, CloudPlanMetadata,
  CloudPlanPanelState, CloudPlanRecord, CloudPlanStatus, LocalPlanSaveStatus,
} from '../../contracts/cloudPlan';
import { CloudLocalStore, generateCloudSecret, privateLink, type CloudBinding, type CloudPending } from './local';
import { parseCloudDocument } from './validation';

/** App/Nurbol adapts S1 here; only complete documents may be sent to the server. */
export interface LocalDraftBridge {
  completeDocument(): CloudPlanDocument | null;
  /** Changes whenever input or an unfinished editor field changes. */
  currentToken(): string;
  saveCurrentDraft(): Promise<boolean>;
  replaceWith(document: CloudPlanDocument): Promise<void>;
  localStatus(): LocalPlanSaveStatus;
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : canonical(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    return `{${Object.keys(data).filter(key => data[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonical(data[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};
const same = (a: CloudPlanDocument | null, b: CloudPlanDocument | null) =>
  a !== null && b !== null && canonical(a) === canonical(b);
const metadata = (record: CloudPlanRecord): CloudPlanMetadata => ({
  planId: record.planId, revision: record.revision, savedAt: record.savedAt, expiresAt: record.expiresAt,
});
const expiredRetry = (pending: CloudPending) => Date.now() - Date.parse(pending.startedAt) > 24 * 60 * 60 * 1000;

/** No server is assumed to exist. Instantiate only when App enables the real API. */
export class CloudPlanCoordinator {
  private cloud: CloudPlanStatus = { kind: 'local-only' };
  private busy = false;
  private staged: { access: CloudPlanAccess; record: CloudPlanRecord } | null = null;
  private revealed = false;
  private copy: CloudPlanPanelState['copyStatus'] = 'idle';
  private localProblem: string | null = null;

  constructor(private readonly client: CloudPlanClient, private readonly store: CloudLocalStore,
    private readonly draft: LocalDraftBridge, private readonly onChange: () => void = () => {},
    private readonly enabled = false) {
    if (!enabled) this.cloud = { kind: 'disabled' };
    else if (store.state?.pending) this.cloud = { kind: 'error', error: { code: 'NETWORK_ERROR', outcome: 'unknown' } };
  }

  get panelState(): CloudPlanPanelState {
    const current = this.validDocument();
    const binding = this.store.state?.binding;
    const pending = this.store.state?.pending;
    const unsent = current !== null && !same(current, binding?.acknowledged ?? null);
    const local = this.draft.localStatus();
    const canSave = this.enabled && !this.busy && !pending && this.cloud.kind !== 'conflict'
      && !this.localProblem && current !== null && local.kind !== 'error';
    const cloud = !this.enabled ? { kind: 'disabled' } as const
      : this.cloud.kind === 'local-only' && binding ? { kind: unsent ? 'dirty' : 'saved' } as const
        : this.cloud.kind === 'saved' && unsent ? { kind: 'dirty' } as const : this.cloud;
    return {
      local, cloud, lastSaved: binding?.metadata ?? null, hasUnsentChanges: unsent,
      canSave, cannotSaveReason: canSave ? null : this.localProblem ?? (!this.enabled ? 'Online saving is not connected yet.'
        : this.busy ? 'A cloud request is in progress.' : pending ? 'Retry or resolve the previous request first.'
          : this.cloud.kind === 'conflict' ? 'Review both versions first.'
            : local.kind === 'error' ? 'Your local draft could not be saved.'
              : current === null ? 'Complete your move details before saving online.' : 'Online saving is unavailable.'),
      privateLink: this.revealed && binding ? privateLink(binding.access) : null,
      copyStatus: this.copy,
    };
  }

  private validDocument(): CloudPlanDocument | null {
    try { return parseCloudDocument(this.draft.completeDocument()); } catch { return null; }
  }
  private changed() { this.onChange(); }
  private problem(message: string) { this.localProblem = message; this.changed(); }
  private async protectDraft(): Promise<boolean> {
    try { return await this.draft.saveCurrentDraft(); } catch { return false; }
  }

  async save(): Promise<void> {
    if (!this.panelState.canSave) return;
    const document = this.validDocument();
    if (!document || !await this.protectDraft()) { this.problem('Your local draft must be saved before an online request.'); return; }
    const binding = this.store.state?.binding;
    const pending: CloudPending = binding
      ? { operation: 'update', requestId: crypto.randomUUID(), startedAt: new Date().toISOString(),
        document, expectedRevision: binding.metadata.revision }
      : { operation: 'create', requestId: crypto.randomUUID(), startedAt: new Date().toISOString(),
        document, secret: generateCloudSecret() };
    try { await this.store.write(binding ?? null, pending); }
    catch { this.problem('Could not keep the private key and request safely in this browser.'); return; }
    await this.dispatch(pending);
  }

  async retry(): Promise<void> {
    const pending = this.store.state?.pending;
    if (!this.enabled || this.busy) return;
    if (!pending && this.localProblem) {
      this.localProblem = null; this.changed();
      await this.save();
      return;
    }
    if (!pending) return;
    if (expiredRetry(pending)) { this.problem('The safe retry window has passed. Reconcile with the server before trying again.'); return; }
    await this.dispatch(pending);
  }

  private async dispatch(pending: CloudPending): Promise<void> {
    if (this.busy) return;
    const binding = this.store.state?.binding;
    this.busy = true; this.cloud = { kind: 'saving', operation: pending.operation }; this.changed();
    try {
      if (pending.operation === 'create') {
        const result = await this.client.create(pending.secret!, { requestId: pending.requestId, document: pending.document! });
        await this.finishRecord(result, pending, null);
      } else if (pending.operation === 'update' && binding) {
        const result = await this.client.update(binding.access, { requestId: pending.requestId,
          expectedRevision: pending.expectedRevision!, document: pending.document! });
        await this.finishRecord(result, pending, binding);
      } else if (pending.operation === 'remove' && binding) {
        const result = await this.client.remove(binding.access, { requestId: pending.requestId,
          expectedRevision: pending.expectedRevision! });
        if (result.ok && result.value.planId === binding.access.planId && result.value.revision === pending.expectedRevision! + 1) {
          await this.store.write(null, null); this.cloud = { kind: 'local-only' }; this.revealed = false; this.localProblem = null; this.staged = null;
        } else await this.finishError(result.ok ? { code: 'INVALID_RESPONSE', outcome: 'unknown' } : result.error, binding);
      } else if (pending.operation === 'rotate-key' && binding) {
        const result = await this.client.rotateKey(binding.access, pending.secret!, { requestId: pending.requestId,
          expectedRevision: pending.expectedRevision! });
        if (result.ok && result.value.planId === binding.access.planId && result.value.revision === pending.expectedRevision! + 1) {
          await this.store.write({ ...binding, access: { ...binding.access, secret: pending.secret! }, metadata: result.value }, null);
          this.cloud = { kind: 'saved' }; this.revealed = false; this.localProblem = null;
        } else await this.finishError(result.ok ? { code: 'INVALID_RESPONSE', outcome: 'unknown' } : result.error, binding);
      }
    } catch {
      this.cloud = { kind: 'error', error: { code: 'INVALID_RESPONSE', outcome: 'unknown' } };
      this.problem('Could not safely update the local cloud binding. The request may have completed; retry the same request.');
    }
    finally { this.busy = false; this.changed(); }
  }

  private async finishRecord(result: CloudPlanClientResult<CloudPlanRecord>, pending: CloudPending, binding: CloudBinding | null) {
    if (!result.ok) { await this.finishError(result.error, binding); return; }
    const record = result.value;
    if ((binding && record.planId !== binding.access.planId)
      || !same(record.document, pending.document ?? null)
      || record.revision !== (pending.expectedRevision ?? 0) + 1) {
      this.cloud = { kind: 'error', error: { code: 'INVALID_RESPONSE', outcome: 'unknown' } };
      return;
    }
    const access = binding?.access ?? { planId: record.planId, secret: pending.secret! };
    await this.store.write({ access, metadata: metadata(record), acknowledged: record.document }, null);
    this.cloud = same(this.validDocument(), record.document) ? { kind: 'saved' } : { kind: 'dirty' };
    this.localProblem = null;
  }

  private async finishError(error: Exclude<CloudPlanClientResult<unknown>, { ok: true }>['error'], binding: CloudBinding | null) {
    if (error.code === 'REVISION_CONFLICT') {
      await this.store.write(binding, null);
      this.cloud = { kind: 'conflict', currentRevision: error.currentRevision };
    } else if (error.code === 'UNAVAILABLE' || error.code === 'INTERNAL_ERROR'
      || ('outcome' in error && error.outcome === 'unknown')) {
      this.cloud = { kind: 'error', error }; // Preserve pending key, snapshot and requestId.
    } else {
      await this.store.write(binding, null);
      this.cloud = { kind: 'error', error };
    }
  }

  /** Fetch only; never replace local data merely because a link was opened. */
  async open(access: CloudPlanAccess): Promise<void> {
    if (!this.enabled || this.busy || this.store.state?.pending) return;
    if (!await this.protectDraft()) { this.problem('Your local draft could not be protected before opening another plan.'); return; }
    this.staged = null;
    this.busy = true; this.cloud = { kind: 'loading' }; this.changed();
    try {
      const result = await this.client.load(access);
      if (result.ok && result.value.planId === access.planId) {
        this.staged = { access, record: result.value };
        this.cloud = { kind: 'conflict', currentRevision: result.value.revision }; // Explicit version choice.
      } else this.cloud = { kind: 'error', error: result.ok
        ? { code: 'INVALID_RESPONSE', outcome: 'not-sent' } : result.error };
    } finally { this.busy = false; this.changed(); }
  }

  /** Explicit choice after open/conflict; keeps a recovery copy before replacing. */
  async loadServerVersion(): Promise<void> {
    if (!this.enabled || this.busy) return;
    const access = this.staged?.access ?? this.store.state?.binding?.access;
    if (!access || !await this.protectDraft()) { this.problem('Your local draft could not be protected before replacement.'); return; }
    const localToken = this.draft.currentToken();
    this.busy = true; this.cloud = { kind: 'loading' }; this.changed();
    try {
      const result = this.staged?.record ? { ok: true as const, value: this.staged.record } : await this.client.load(access);
      if (!result.ok || result.value.planId !== access.planId) {
        this.cloud = { kind: 'error', error: result.ok ? { code: 'INVALID_RESPONSE', outcome: 'not-sent' } : result.error };
        return;
      }
      if (this.draft.currentToken() !== localToken) {
        this.staged = { access, record: result.value };
        this.cloud = { kind: 'conflict', currentRevision: result.value.revision };
        this.problem('Local edits changed while loading. Review both versions again before replacing.');
        return;
      }
      this.store.archiveCurrent();
      const record = result.value;
      await this.store.write({ access, metadata: metadata(record), acknowledged: record.document }, null);
      await this.draft.replaceWith(record.document);
      this.staged = null; this.cloud = { kind: 'saved' }; this.revealed = false; this.localProblem = null;
    } catch { this.problem('Could not replace the local plan safely. Your prior draft was kept.'); }
    finally { this.busy = false; this.changed(); }
  }

  /** Conflict resolution creates a different plan, never overwrites the newer server revision. */
  async saveLocalAsNew(): Promise<void> {
    if (!this.enabled || this.busy || this.store.state?.pending) return;
    const document = this.validDocument();
    if (!document || !await this.protectDraft()) { this.problem('Save your local draft before creating another cloud plan.'); return; }
    try {
      this.store.archiveCurrent();
      await this.store.write(null, null);
      this.cloud = { kind: 'local-only' }; this.staged = null;
      await this.save();
    } catch { this.problem('Could not preserve the previous private link.'); }
  }

  async remove(): Promise<void> {
    const binding = this.store.state?.binding;
    if (!this.enabled || !binding || this.busy || this.store.state?.pending) return;
    const pending: CloudPending = { operation: 'remove', requestId: crypto.randomUUID(),
      startedAt: new Date().toISOString(), expectedRevision: binding.metadata.revision };
    try { await this.store.write(binding, pending); await this.dispatch(pending); }
    catch { this.problem('Could not keep the delete request safely.'); }
  }

  async rotateKey(): Promise<void> {
    const binding = this.store.state?.binding;
    if (!this.enabled || !binding || this.busy || this.store.state?.pending) return;
    const pending: CloudPending = { operation: 'rotate-key', requestId: crypto.randomUUID(),
      startedAt: new Date().toISOString(), expectedRevision: binding.metadata.revision, secret: generateCloudSecret() };
    try { await this.store.write(binding, pending); await this.dispatch(pending); }
    catch { this.problem('Could not keep the new private key safely.'); }
  }

  revealLink(): void { if (this.store.state?.binding) { this.revealed = true; this.changed(); } }
  async copyLink(clipboard: Pick<Clipboard, 'writeText'> = navigator.clipboard): Promise<void> {
    const binding = this.store.state?.binding;
    if (!binding) return;
    try { await clipboard.writeText(privateLink(binding.access)); this.copy = 'copied'; }
    catch { this.copy = 'failed'; }
    this.changed();
  }
}
