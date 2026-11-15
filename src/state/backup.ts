import type { MoveInput, PaymentEvent } from '../domain/types';
import { DRAFT_KEY } from './draft';
import { parseSnapshot, STORAGE_KEY, type Snapshot } from './storage';

export const MAX_BACKUP_BYTES = 500_000;
export const BACKUP_PREFIX = 'movegap.backup.before-import.';

export interface PlanBackupFile { version: 1; exportedAt: string; snapshot: Snapshot }

function validateSnapshot(snapshot: Snapshot): void {
  const ids = new Set<string>();
  const events: PaymentEvent[] = [
    ...snapshot.input.commonEvents,
    ...snapshot.input.housingOptions.flatMap(option => option.events),
    ...snapshot.input.movingOptions.flatMap(option => option.events),
  ];
  const optionIds = [...snapshot.input.housingOptions, ...snapshot.input.movingOptions].map(option => option.id);
  for (const id of optionIds) {
    if (!id.trim() || ids.has(id)) throw new Error('Backup has duplicate or empty option IDs.');
    ids.add(id);
  }
  const eventIds = new Set<string>();
  for (const event of events) {
    if (!event.id.trim() || eventIds.has(event.id)) throw new Error('Backup has duplicate or empty payment IDs.');
    eventIds.add(event.id);
  }
  const money = (amount: number) => Number.isSafeInteger(amount) && amount >= 0 && amount <= 1_000_000_000;
  if (!money(snapshot.input.openingCashCents) || !money(snapshot.input.reserveCents)) throw new Error('Backup has invalid money values.');
  for (const event of events) {
    if (!money(event.amountCents) || (event.actual && !money(event.actual.amountCents))) throw new Error('Backup has invalid money values.');
    for (const [target, relationship] of Object.entries(event.actualLinks ?? {})) {
      if (!eventIds.has(target) || target === event.id || !['same-payment', 'separate-payment'].includes(relationship))
        throw new Error('Backup has an invalid payment relationship.');
    }
  }
}

export function createPlanBackup(input: MoveInput, selectedId: string | null): string {
  const snapshot = parseSnapshot(JSON.stringify({ input, selectedId, savedAt: new Date().toISOString() }));
  validateSnapshot(snapshot);
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), snapshot }, null, 2);
}

export function parsePlanBackup(raw: string): PlanBackupFile {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error('Backup file is too large.');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Backup format is invalid.');
  const file = value as Partial<PlanBackupFile>;
  if (file.version !== 1 || typeof file.exportedAt !== 'string' || !file.snapshot)
    throw new Error('Backup version or format is not supported.');
  const snapshot = parseSnapshot(JSON.stringify(file.snapshot));
  validateSnapshot(snapshot);
  return { version: 1, exportedAt: file.exportedAt, snapshot };
}

/** Preserve the exact prior record before replacement. A failed write leaves it available. */
export function restorePlanBackup(file: PlanBackupFile, storage: Pick<Storage, 'getItem' | 'setItem'>,
  expectedRaw: string | null, currentSnapshot?: Snapshot): string | null {
  const validated = parsePlanBackup(JSON.stringify(file));
  if (storage.getItem(DRAFT_KEY) !== null)
    throw new Error('An autosaved draft is active. Restore through the draft controller to keep both versions consistent.');
  if (storage.getItem(STORAGE_KEY) !== expectedRaw) throw new Error('Another tab changed this plan. Preview the file again before replacing it.');
  let preservedKey: string | null = null;
  if (expectedRaw !== null) {
    preservedKey = `${BACKUP_PREFIX}${crypto.randomUUID()}`;
    storage.setItem(preservedKey, expectedRaw);
  }
  if (currentSnapshot) {
    const currentRaw = JSON.stringify(parseSnapshot(JSON.stringify(currentSnapshot)));
    if (currentRaw !== expectedRaw) {
      preservedKey = `${BACKUP_PREFIX}${crypto.randomUUID()}`;
      storage.setItem(preservedKey, currentRaw);
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(validated.snapshot));
  return preservedKey;
}
