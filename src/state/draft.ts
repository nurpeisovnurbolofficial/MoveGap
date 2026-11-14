import type { MoveInput } from '../domain/types';
import { parseSnapshot, STORAGE_KEY } from './storage';

export const DRAFT_KEY = 'movegap.draft.v2';
const MAX_DRAFT_BYTES = 500_000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Raw editor values belong here, including invalid or unfinished text. A draft is never calculated. */
export interface DraftContent {
  inputDraft: unknown;
  selectedId: string | null;
  formDrafts: Record<string, unknown>;
}
export interface DraftRecord {
  version: 2;
  revision: number;
  tabId: string;
  updatedAt: string;
  content: DraftContent;
}
export type DraftStatus = 'saved' | 'saving' | 'error' | 'conflict';
export type DraftRead = { record: DraftRecord | null; legacy: boolean; error: string | null };
export type SaveResult = { status: 'saved'; record: DraftRecord } |
  { status: 'superseded' } |
  { status: 'error'; error: string } |
  { status: 'conflict'; remote: DraftRecord | null; local: DraftContent };

export function parseDraft(raw: string): DraftRecord {
  if (raw.length > MAX_DRAFT_BYTES) throw new Error('Draft is too large.');
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 2 || !Number.isSafeInteger(value.revision)
    || (value.revision as number) < 1 || typeof value.tabId !== 'string' || !value.tabId
    || typeof value.updatedAt !== 'string' || !isRecord(value.content)
    || (value.content.selectedId !== null && typeof value.content.selectedId !== 'string')
    || !isRecord(value.content.formDrafts) || !('inputDraft' in value.content)) {
    throw new Error('Draft format is invalid.');
  }
  return value as unknown as DraftRecord;
}

/** Reads v2 first. A damaged v2 record is left untouched, including when an old v1 plan exists. */
export function readDraft(storage: Pick<Storage, 'getItem'>): DraftRead {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (raw !== null) return { record: parseDraft(raw), legacy: false, error: null };
    const old = storage.getItem(STORAGE_KEY);
    if (old === null) return { record: null, legacy: false, error: null };
    const snapshot = parseSnapshot(old);
    return { record: {
      version: 2, revision: 0, tabId: 'legacy', updatedAt: snapshot.savedAt,
      content: { inputDraft: snapshot.input, selectedId: snapshot.selectedId, formDrafts: {} },
    }, legacy: true, error: null };
  } catch {
    return { record: null, legacy: false, error: 'Saved data could not be read. The original record has not been changed.' };
  }
}

/** Only complete, valid input may enter the financial engine. The raw draft remains available. */
export function completeDraftInput(content: DraftContent): MoveInput | null {
  try {
    const snapshot = parseSnapshot(JSON.stringify({
      input: content.inputDraft, selectedId: content.selectedId, savedAt: new Date().toISOString(),
    }));
    return snapshot.input;
  } catch { return null; }
}

type LockProvider = Pick<LockManager, 'request'>;

/** A tab session serializes its own saves; Web Locks serialize all tabs on this origin. */
export class DraftSession {
  readonly tabId: string;
  status: DraftStatus = 'saved';
  error: string | null = null;
  record: DraftRecord | null = null;
  pending: DraftContent | null = null;
  remote: DraftRecord | null = null;
  private revision = 0;
  private generation = 0;
  private queue: Promise<SaveResult> = Promise.resolve({ status: 'error', error: 'No save scheduled.' });
  private listener: (() => void) | null = null;

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>,
    private locks: LockProvider | undefined,
    private onChange: (session: DraftSession) => void = () => {}, tabId?: string) {
    this.tabId = tabId ?? crypto.randomUUID();
    const initial = readDraft(storage);
    if (initial.error) { this.status = 'error'; this.error = initial.error; }
    else if (initial.record) { this.record = initial.record; this.revision = initial.record.revision; }
  }

  get hasUnprotectedChanges(): boolean { return this.pending !== null; }
  get currentContent(): DraftContent | null { return this.pending ?? this.record?.content ?? null; }

  /** Call on every input/editor change. No debounce: quick refreshes are protected by pending state. */
  autosave(content: DraftContent): Promise<SaveResult> {
    this.pending = content;
    if (this.status !== 'conflict' && !this.error) this.status = 'saving';
    this.onChange(this);
    const generation = this.generation;
    this.queue = this.queue.then(() => this.write(content, generation), () => this.write(content, generation));
    return this.queue;
  }

  private async write(content: DraftContent, generation: number): Promise<SaveResult> {
    if (generation !== this.generation) return { status: 'superseded' };
    if (this.status === 'conflict') return { status: 'conflict', remote: this.remote, local: this.pending ?? content };
    if (!this.locks) return this.fail('This browser cannot safely coordinate multiple tabs. Draft was not saved.');
    try {
      const result = await this.locks.request(DRAFT_KEY, { mode: 'exclusive' }, async (): Promise<SaveResult> => {
        // A version choice can happen while this write waits for another tab's lock.
        if (generation !== this.generation) return { status: 'superseded' };
        if (this.status === 'conflict') return { status: 'conflict', remote: this.remote, local: this.pending ?? content };
        const raw = this.storage.getItem(DRAFT_KEY);
        const latest = raw === null ? null : parseDraft(raw);
        if ((latest?.revision ?? 0) !== this.revision) {
          this.remote = latest;
          this.status = 'conflict';
          this.onChange(this);
          return { status: 'conflict', remote: latest, local: this.pending ?? content };
        }
        const next: DraftRecord = {
          version: 2, revision: this.revision + 1, tabId: this.tabId,
          updatedAt: new Date().toISOString(), content,
        };
        const encoded = JSON.stringify(next);
        if (encoded.length > MAX_DRAFT_BYTES) throw new Error('Draft is too large.');
        parseDraft(encoded);
        this.storage.setItem(DRAFT_KEY, encoded);
        this.record = next;
        this.revision = next.revision;
        this.error = null;
        if (this.pending === content) { this.pending = null; this.status = 'saved'; }
        this.onChange(this);
        return { status: 'saved', record: next };
      });
      return result;
    } catch {
      return this.fail('Draft could not be saved. Check browser storage; your changes are still in this tab.');
    }
  }

  private fail(message: string): SaveResult {
    this.status = 'error'; this.error = message; this.onChange(this);
    return { status: 'error', error: message };
  }

  /** Explicitly choose a version. Choosing local overwrites remote under the same writer lock. */
  async resolveConflict(choice: 'local' | 'remote'): Promise<SaveResult | null> {
    if (this.status !== 'conflict') return null;
    if (choice === 'local' && !this.pending) return null;
    // Invalidate both queued writes and writes already waiting for the Web Lock.
    this.generation++;
    if (choice === 'remote') {
      if (!this.remote) {
        this.record = null; this.revision = 0; this.pending = null;
        this.error = null; this.status = 'saved'; this.onChange(this);
        return null;
      }
      this.record = this.remote; this.revision = this.remote.revision;
      this.pending = null; this.remote = null; this.error = null; this.status = 'saved';
      this.onChange(this);
      return { status: 'saved', record: this.record };
    }
    const local = this.pending;
    if (!local) return null;
    this.revision = this.remote?.revision ?? 0;
    this.remote = null; this.error = null; this.status = 'saving';
    return this.autosave(local);
  }

  /** Storage events inform the UI; they are never used as the write lock. */
  handleStorageEvent(key: string | null, newValue: string | null): void {
    if (key !== DRAFT_KEY) return;
    if (newValue === null) {
      if (this.pending) { this.remote = null; this.status = 'conflict'; }
      else { this.record = null; this.revision = 0; this.status = 'saved'; }
      this.onChange(this);
      return;
    }
    try {
      const next = parseDraft(newValue);
      if (next.tabId === this.tabId || next.revision <= this.revision) return;
      if (this.pending) { this.remote = next; this.status = 'conflict'; }
      else { this.record = next; this.revision = next.revision; this.status = 'saved'; }
      this.onChange(this);
    } catch { this.fail('Another tab wrote an unreadable draft. Your local changes were kept.'); }
  }

  bindWindow(target: Window = window): () => void {
    this.listener?.();
    const storage = (event: StorageEvent) => this.handleStorageEvent(event.key, event.newValue);
    const leaving = (event: BeforeUnloadEvent) => {
      if (this.hasUnprotectedChanges) { event.preventDefault(); event.returnValue = ''; }
    };
    target.addEventListener('storage', storage);
    target.addEventListener('beforeunload', leaving);
    this.listener = () => {
      target.removeEventListener('storage', storage);
      target.removeEventListener('beforeunload', leaving);
      this.listener = null;
    };
    return this.listener;
  }
}
