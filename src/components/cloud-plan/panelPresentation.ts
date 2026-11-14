import type { CloudPlanPanelState } from '../../contracts/cloudPlan';

export function cloudMessage(state: CloudPlanPanelState): string {
  const cloud = state.cloud;
  switch (cloud.kind) {
    case 'disabled': return 'Online saving is not connected yet.';
    case 'local-only': return 'This plan has not been saved online.';
    case 'loading': return 'Opening your saved plan… Your current plan stays available until loading succeeds.';
    case 'saving': return cloud.operation === 'remove' ? 'Deleting the online copy…' : cloud.operation === 'rotate-key' ? 'Changing the private link…' : 'Saving a copy online…';
    case 'saved': return state.hasUnsentChanges ? 'Your latest changes have not been saved online.' : 'Your current plan is saved online.';
    case 'dirty': return 'Your latest changes have not been saved online.';
    case 'conflict': return 'Review the online version before replacing this browser’s plan. Choose which version to keep working with.';
    case 'error': {
      const error = cloud.error;
      if ('outcome' in error && error.outcome === 'unknown') return 'The last request may have completed, but we could not confirm it. Retry the same request before starting another save.';
      switch (error.code) {
        case 'NOT_FOUND': return 'This private link is unavailable. It may be incorrect, expired, deleted, or replaced. Your current plan has not been replaced.';
        case 'REVISION_CONFLICT': return 'Another browser saved a newer version. Choose which version to keep working with.';
        case 'NETWORK_ERROR': return 'Could not connect. You may be offline. Your current plan is still available on this page.';
        case 'ABORTED': return 'The request was interrupted. Your current plan is still available on this page.';
        case 'INVALID_RESPONSE': return 'The service returned an unreadable response. Your current plan has not been replaced.';
        case 'INVALID_DOCUMENT': return 'Some move details cannot be saved online. Review your amounts, dates, and payment relationships.';
        case 'PAYLOAD_TOO_LARGE': return 'This plan is too large to save online. Your current plan is still available here.';
        case 'RATE_LIMITED': return `Too many requests. Try again in ${Math.max(1, Math.ceil(error.retryAfterSeconds))} seconds.`;
        case 'REQUEST_ID_REUSED': return 'This request cannot be repeated with different changes. Your current plan is still available; resolve the previous request before saving again.';
        case 'BAD_REQUEST': return 'The request could not be accepted. Your current plan is still available here.';
        case 'UNAVAILABLE': case 'INTERNAL_ERROR': return 'Online saving is temporarily unavailable. Your current plan is still available here.';
      }
    }
  }
}

export function panelPermissions(state: CloudPlanPanelState) {
  const { cloud } = state;
  const busy = cloud.kind === 'loading' || cloud.kind === 'saving';
  const error = cloud.kind === 'error' ? cloud.error : null;
  const uncertain = !!error && 'outcome' in error && error.outcome === 'unknown';
  const conflict = cloud.kind === 'conflict' || error?.code === 'REVISION_CONFLICT';
  const unavailable = cloud.kind === 'disabled';
  const invalidLink = error?.code === 'NOT_FOUND';
  return { busy, uncertain, conflict,
    save: state.canSave && !busy && !conflict && !uncertain && !unavailable,
    open: !busy && !uncertain && !unavailable && !conflict,
    link: !!state.lastSaved && !busy && !uncertain && !invalidLink && !unavailable,
    manage: !!state.lastSaved && !busy && !uncertain && !invalidLink && !unavailable && !conflict,
    retry: !!error && ['NETWORK_ERROR', 'ABORTED', 'INVALID_RESPONSE', 'RATE_LIMITED', 'UNAVAILABLE', 'INTERNAL_ERROR'].includes(error.code) && !busy,
  };
}
