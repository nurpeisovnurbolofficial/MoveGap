import { findAdjustments, type AdjustmentRequest } from './adjustments';
import type { MoveInput } from './types';

self.onmessage = (event: MessageEvent<{ input: MoveInput; request: AdjustmentRequest }>) => {
  try { self.postMessage({ result: findAdjustments(event.data.input, event.data.request) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not calculate the requested changes.' }); }
};
