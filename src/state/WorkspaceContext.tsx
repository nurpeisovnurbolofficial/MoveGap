import { createContext, useContext, useState, type ReactNode, type SetStateAction } from 'react';
import type { WorkspaceController } from './workspace';

export const WorkspaceContext = createContext<WorkspaceController | null>(null);
export function WorkspaceProvider({ controller, children }: { controller: WorkspaceController; children: ReactNode }) {
  return <WorkspaceContext.Provider value={controller}>{children}</WorkspaceContext.Provider>;
}
/** Writes each editor change immediately; incomplete fields never enter cloud documents. */
export function useDraftField<T>(key: string, initial: T): [T, (value: SetStateAction<T>) => void] {
  const controller = useContext(WorkspaceContext);
  const [fallback, setFallback] = useState(initial);
  const stored = controller && key ? controller.content.formDrafts[key] : undefined;
  const value = stored === undefined ? (controller && key ? initial : fallback) : stored as T;
  return [value, next => {
    const resolved = typeof next === 'function' ? (next as (value: T) => T)(value) : next;
    if (controller && key) controller.setField(key, resolved); else setFallback(resolved);
  }];
}
