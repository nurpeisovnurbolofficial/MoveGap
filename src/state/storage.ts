import type { MoveInput, PaymentEvent } from '../domain/types';
import { calculatePlans } from '../domain/engine';

export const STORAGE_KEY = 'movegap.workspace.v1';
export interface Snapshot { input: MoveInput; selectedId: string | null; savedAt: string }
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const events = (v: unknown): v is PaymentEvent[] => Array.isArray(v) && v.every(e => record(e)
  && typeof e.id === 'string' && typeof e.label === 'string' && typeof e.date === 'string'
  && typeof e.amountCents === 'number' && typeof e.kind === 'string' && typeof e.confirmation === 'string'
  && (e.actual === undefined || (record(e.actual) && typeof e.actual.date === 'string' && typeof e.actual.amountCents === 'number')));

export function parseSnapshot(raw: string): Snapshot {
  if (raw.length > 500000) throw new Error('Saved plan is too large.');
  const s: unknown = JSON.parse(raw);
  if (!record(s) || !record(s.input)) throw new Error('Saved plan format is invalid.');
  const i=s.input;
  if (i.version !== 1 || typeof i.startDate !== 'string' || typeof i.latestMoveDate !== 'string'
    || typeof i.openingCashCents !== 'number' || typeof i.reserveCents !== 'number' || !events(i.commonEvents)
    || !Array.isArray(i.housingOptions) || !i.housingOptions.every(h=>record(h) && typeof h.id==='string' && typeof h.label==='string' && typeof h.availableFrom==='string' && typeof h.confirmation==='string' && events(h.events))
    || !Array.isArray(i.movingOptions) || !i.movingOptions.every(m=>record(m) && typeof m.id==='string' && typeof m.label==='string' && typeof m.moveDate==='string' && typeof m.confirmation==='string' && events(m.events))
    || (s.selectedId !== null && typeof s.selectedId !== 'string') || typeof s.savedAt !== 'string') throw new Error('Saved plan format is invalid.');
  const snapshot = s as unknown as Snapshot;
  const result=calculatePlans(snapshot.input);
  if (result.errors.length || (snapshot.selectedId && !result.plans.some(p=>p.id===snapshot.selectedId))) throw new Error('Saved plan has invalid amounts, dates or options.');
  return snapshot;
}
export function loadSnapshot(): { snapshot: Snapshot | null; error: string | null } {
  try { const raw=localStorage.getItem(STORAGE_KEY); return {snapshot:raw ? parseSnapshot(raw):null,error:null}; }
  catch { return {snapshot:null,error:'Your saved plan could not be opened. The example is loaded; your saved data has not been overwritten.'}; }
}
export function saveSnapshot(snapshot: Snapshot) {
  const raw=JSON.stringify(snapshot); parseSnapshot(raw); localStorage.setItem(STORAGE_KEY,raw);
}
