import type { MoveInput } from '../domain/types';
import { createExample } from '../domain/example';
import { DraftSession, DRAFT_KEY, type DraftContent } from './draft';
import { parseSnapshot, STORAGE_KEY } from './storage';
import { CloudLocalStore, CLOUD_LOCAL_KEY, parsePrivateLink, consumeRestoreFragment } from './cloud/local';
import { CloudPlanCoordinator } from './cloud/coordinator';
import { HttpCloudPlanClient } from './cloud/transport';
import type { CloudPlanAccess, CloudPlanDocument, LocalPlanSaveStatus } from '../contracts/cloudPlan';

export const RECOVERY_PREFIX = 'movegap.recovery.v1.';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Incomplete numeric fields survive JSON as null, then become NaN only in editor state. */
export function readWorkspaceInput(value: unknown): MoveInput {
  if (!object(value) || value.version !== 1 || typeof value.startDate !== 'string' || typeof value.latestMoveDate !== 'string'
    || ![value.openingCashCents, value.reserveCents].every(v => v === null || typeof v === 'number')
    || !Array.isArray(value.commonEvents) || !Array.isArray(value.housingOptions) || !Array.isArray(value.movingOptions)
    || value.housingOptions.length > 3 || value.movingOptions.length > 3) throw new Error('Unreadable draft');
  const events = (items: unknown): boolean => Array.isArray(items) && items.length <= 300 && items.every(e => object(e)
    && typeof e.id === 'string' && typeof e.label === 'string' && typeof e.date === 'string'
    && typeof e.amountCents === 'number' && ['income','expense','refundable-deposit','deposit-refund'].includes(String(e.kind))
    && ['confirmed','proposed'].includes(String(e.confirmation))
    && (e.actual === undefined || (object(e.actual) && typeof e.actual.amountCents === 'number' && typeof e.actual.date === 'string'))
    && (e.actualLinks === undefined || (object(e.actualLinks) && Object.values(e.actualLinks).every(v => v === 'same-payment' || v === 'separate-payment'))));
  if (!events(value.commonEvents) || ![...value.housingOptions, ...value.movingOptions].every(o => object(o)
    && typeof o.id === 'string' && typeof o.label === 'string' && ['confirmed','proposed'].includes(String(o.confirmation)) && events(o.events))
    || !value.housingOptions.every(o => typeof o.availableFrom === 'string')
    || !value.movingOptions.every(o => typeof o.moveDate === 'string')) throw new Error('Unreadable draft');
  return { ...value, openingCashCents: value.openingCashCents ?? NaN, reserveCents: value.reserveCents ?? NaN } as unknown as MoveInput;
}

export class WorkspaceController {
  content: DraftContent;
  readonly draft: DraftSession;
  cloud: CloudPlanCoordinator | null = null;
  cloudStore: CloudLocalStore | null = null;
  error: string | null = null;
  cloudChanged = false;
  epoch = 0;
  private version = 0;
  private listeners = new Set<() => void>();
  private restoredLink = false;
  private invalidInitial = false;
  readonly subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  readonly snapshot = () => this.version;
  readonly notify = () => { this.version++; this.listeners.forEach(fn => fn()); };

  constructor(private storage: Storage, locks: Pick<LockManager, 'request'> | undefined,
    private restoreAccess: CloudPlanAccess | null = null) {
    this.content = { inputDraft: createExample(), selectedId: null, formDrafts: { source: 'example' } };
    this.draft = new DraftSession(storage, locks, session => {
      const next = session.currentContent;
      if (next && next !== this.content) {
        try { readWorkspaceInput(next.inputDraft); this.content = next; }
        catch { this.error = 'The saved draft cannot be opened. Its original data has been kept.'; }
      }
      this.notify();
    });
    const initial = this.draft.currentContent;
    if (initial) {
      try { readWorkspaceInput(initial.inputDraft); this.content = initial; }
      catch { this.invalidInitial = true; this.error = 'The saved draft cannot be opened. Download the original before starting again.'; }
    }
    try {
      this.cloudStore = new CloudLocalStore(storage, locks);
      this.cloud = this.createCloudCoordinator();
    } catch { this.error = 'Online saving could not read its local settings. Your existing data has been kept.'; }
  }
  private createCloudCoordinator(): CloudPlanCoordinator {
    return new CloudPlanCoordinator(new HttpCloudPlanClient(), this.cloudStore!, {
      completeDocument: () => this.completeDocument(), currentToken: () => JSON.stringify(this.content),
      saveCurrentDraft: () => this.save(), replaceWith: document => this.replaceDocument(document),
      localStatus: () => this.localStatus(),
    }, this.notify, true);
  }
  get input(): MoveInput { return readWorkspaceInput(this.content.inputDraft); }
  get selectedId(): string | null { return this.content.selectedId; }
  get source(): 'example' | 'own' | 'saved' {
    const source = this.content.formDrafts.source;
    return source === 'example' || source === 'own' ? source : 'saved';
  }
  localStatus(): LocalPlanSaveStatus {
    if (this.invalidInitial || this.draft.error || this.draft.status === 'conflict') return { kind: 'error' };
    if (this.draft.status === 'saving') return { kind: 'saving' };
    return this.draft.record ? { kind: 'saved', savedAt: this.draft.record.updatedAt } : { kind: 'unsaved' };
  }
  completeDocument(): CloudPlanDocument | null {
    if (this.cloudChanged || this.invalidInitial || Object.entries(this.content.formDrafts).some(([key, value]) => key.startsWith('open.') && value != null)) return null;
    try {
      const snapshot = parseSnapshot(JSON.stringify({ input: this.input, selectedId: this.selectedId, savedAt: new Date().toISOString() }));
      return { schemaVersion: 1, input: snapshot.input, selectedId: snapshot.selectedId };
    } catch { return null; }
  }
  private persist(next: DraftContent): void {
    this.content = next; this.error = null;
    if (this.invalidInitial) { this.error = 'The unreadable original draft has not been overwritten. Export it before replacing it.'; this.notify(); return; }
    void this.draft.autosave(next);
  }
  updateInput(input: MoveInput): void { this.persist({ ...this.content, inputDraft: input }); }
  select(id: string | null): void { this.persist({ ...this.content, selectedId: id }); }
  setField(key: string, value: unknown): void {
    if (JSON.stringify(this.content.formDrafts[key]) === JSON.stringify(value)) return;
    this.persist({ ...this.content, formDrafts: { ...this.content.formDrafts, [key]: value } });
  }
  clearFields(prefix: string): void {
    this.persist({ ...this.content, formDrafts: Object.fromEntries(Object.entries(this.content.formDrafts).filter(([key]) => !key.startsWith(prefix))) });
  }
  async save(): Promise<boolean> {
    if (this.invalidInitial || this.draft.status === 'conflict') return false;
    const result = await this.draft.autosave(this.content);
    return result.status === 'saved' && !this.draft.hasUnprotectedChanges && this.draft.status === 'saved';
  }
  async archive(): Promise<void> {
    if (!await this.save()) throw new Error('Your current draft could not be protected. Resolve the local saving error first.');
    this.storage.setItem(`${RECOVERY_PREFIX}${crypto.randomUUID()}`, JSON.stringify({ savedAt: new Date().toISOString(), content: this.content }));
  }
  async replaceDocument(document: CloudPlanDocument): Promise<void> {
    await this.archive();
    const next = { inputDraft: document.input, selectedId: document.selectedId, formDrafts: { source: 'saved' } };
    const result = await this.draft.autosave(next);
    if (result.status !== 'saved') throw new Error('Could not restore this plan safely.');
    this.epoch++; this.notify();
  }
  async newMove(input: MoveInput, source: 'example' | 'own'): Promise<void> {
    if (this.cloudStore?.state?.pending || this.cloud?.panelState.cloud.kind === 'loading' || this.cloud?.panelState.cloud.kind === 'saving')
      throw new Error('Finish or retry the cloud request before starting another move.');
    await this.archive();
    if (this.cloudStore) { this.cloudStore.archiveCurrent(); await this.cloudStore.write(null, null); }
    const result = await this.draft.autosave({ inputDraft: input, selectedId: null, formDrafts: { source } });
    if (result.status !== 'saved') throw new Error('Could not save the new move. Your previous copy is available in recovery.');
    if (this.cloudStore) this.cloud = this.createCloudCoordinator();
    this.epoch++; this.notify();
  }
  recoveryCopies(): { key: string; savedAt: string }[] {
    return Object.keys(this.storage).filter(key => key.startsWith(RECOVERY_PREFIX)).flatMap(key => {
      try { const value = JSON.parse(this.storage.getItem(key)!); return typeof value.savedAt === 'string' ? [{ key, savedAt: value.savedAt }] : []; } catch { return []; }
    }).sort((a,b) => b.savedAt.localeCompare(a.savedAt));
  }
  async restoreRecovery(key: string): Promise<void> {
    if (!key.startsWith(RECOVERY_PREFIX)) throw new Error('Invalid recovery copy.');
    const value = JSON.parse(this.storage.getItem(key) ?? 'null');
    if (!object(value) || !object(value.content) || !object(value.content.formDrafts)) throw new Error('This recovery copy could not be read.');
    readWorkspaceInput(value.content.inputDraft);
    if (value.content.selectedId !== null && typeof value.content.selectedId !== 'string') throw new Error('This recovery copy could not be read.');
    await this.archive();
    const result = await this.draft.autosave(value.content as unknown as DraftContent);
    if (result.status !== 'saved') throw new Error('Could not restore the recovery copy.');
    this.epoch++; this.notify();
  }
  async resolveConflict(choice: 'local' | 'remote'): Promise<void> {
    this.storage.setItem(`${RECOVERY_PREFIX}${crypto.randomUUID()}`, JSON.stringify({ savedAt: new Date().toISOString(), content: this.content }));
    await this.draft.resolveConflict(choice);
    this.epoch++; this.notify();
  }
  async openLink(link: string): Promise<void> {
    const access = parsePrivateLink(link);
    if (!access) { this.error = 'Paste a complete private link from this MoveGap site.'; this.notify(); return; }
    await this.cloud?.open(access);
  }
  bind(): () => void {
    const unbind = this.draft.bindWindow();
    const storageEvent = (event: StorageEvent) => {
      if (event.key === CLOUD_LOCAL_KEY) { this.cloudChanged = true; this.error = 'Online settings changed in another tab. Your draft is kept; reload before using online saving.'; this.notify(); }
      if (event.key === DRAFT_KEY && this.draft.status !== 'conflict') { this.epoch++; this.notify(); }
    };
    window.addEventListener('storage', storageEvent);
    const restoreNavigation = () => {
      if (!location.hash.startsWith('#/restore/')) return;
      const access = consumeRestoreFragment();
      if (!access) { this.error = 'This private link is not valid.'; this.notify(); return; }
      if (this.cloudChanged || this.cloudStore?.state?.pending) { this.error = 'Finish the pending cloud request or reload before opening another private link.'; this.notify(); return; }
      void this.cloud?.open(access);
    };
    window.addEventListener('hashchange', restoreNavigation);
    if (this.restoreAccess && !this.restoredLink) { this.restoredLink = true; void this.cloud?.open(this.restoreAccess); }
    return () => { unbind(); window.removeEventListener('storage', storageEvent); window.removeEventListener('hashchange', restoreNavigation); };
  }
  exportOriginal(): string { return this.storage.getItem(DRAFT_KEY) ?? this.storage.getItem(STORAGE_KEY) ?? JSON.stringify(this.content); }
}
