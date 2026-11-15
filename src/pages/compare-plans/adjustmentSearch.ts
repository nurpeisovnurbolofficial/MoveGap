import type { MoveInput } from '../../domain/types';
import type { AdjustmentRequest, findAdjustments } from '../../domain/adjustments';

export function searchInBackground(input: MoveInput, request: AdjustmentRequest, signal: AbortSignal): Promise<ReturnType<typeof findAdjustments>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Search cancelled.')); return; }
    const worker = new Worker(new URL('../../domain/adjustments.worker.ts', import.meta.url), { type: 'module' });
    const dispose = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { dispose(); reject(new Error('Search cancelled.')); };
    const timer = setTimeout(() => { dispose(); reject(new Error('The search took too long. Narrow the allowed dates and try again.')); }, 30000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => { dispose(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result); };
    worker.onerror = () => { dispose(); reject(new Error('The background calculation could not run. Your plan has not changed.')); };
    try { worker.postMessage({ input, request }); } catch (error) { dispose(); reject(error); }
  });
}
