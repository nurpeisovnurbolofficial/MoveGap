import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cloudPlanPanelExamples } from '../../contracts/cloudPlan.examples';
import type { CloudPlanPanelProps, CloudPlanPanelState } from '../../contracts/cloudPlan';
import { CloudPlanPanel } from './CloudPlanPanel';
import { cloudMessage, panelPermissions } from './panelPresentation';

function render(state:CloudPlanPanelState) {
  const unexpected = () => { throw Error('Rendering must never perform an action.'); };
  const callbacks:Omit<CloudPlanPanelProps,'state'>={onSave:unexpected,onOpenLink:unexpected,onCopyLink:unexpected,onRevealLink:unexpected,onLoadServerVersion:unexpected,onSaveLocalAsNew:unexpected,onDeleteCloudCopy:unexpected,onRotateLink:unexpected,onRetry:unexpected};
  return renderToStaticMarkup(<CloudPlanPanel state={state} {...callbacks}/>);
}

describe('CloudPlanPanel controlled states',()=>{
  it('renders all contract examples without invoking callbacks or claiming a connection',()=>{
    for(const state of Object.values(cloudPlanPanelExamples())){
      const html=render(state);expect(html).toContain('read and change');expect(html).toContain('90 days');expect(html).not.toContain('NaN');
    }
    expect(render(cloudPlanPanelExamples().disabled)).toContain('Online saving is not connected yet.');
  });
  it('keeps local and online outcomes separate, including local storage failure',()=>{
    const fixtures=cloudPlanPanelExamples();
    expect(render(fixtures.offline)).toContain('Saved in this browser');
    expect(render(fixtures.offline)).toContain('Could not connect.');
    expect(render(fixtures.localFailure)).toContain('This browser could not save your draft.');
    expect(cloudMessage({...fixtures.saved,hasUnsentChanges:true})).toBe('Your latest changes have not been saved online.');
  });
  it('never reveals the private link in markup until explicitly requested',()=>{
    const state={...cloudPlanPanelExamples().saved,privateLink:'https://example.invalid/#/restore/EXAMPLE/NOT-A-REAL-KEY'};
    const html=render(state);expect(html).not.toContain(state.privateLink);expect(html).not.toContain('href=');
    expect(html).toContain('Show link for manual copy');
  });
  it('keeps both conflict actions explicit and blocks silent saves',()=>{
    const state=cloudPlanPanelExamples().conflict;const html=render(state);
    expect(html).toContain('Keep my copy and load online version');expect(html).toContain('Save my version as a separate plan');
    expect(panelPermissions({...state,canSave:true}).save).toBe(false);expect(panelPermissions(state).manage).toBe(false);
  });
  it('does not start another mutation when the last outcome is unknown',()=>{
    const state={...cloudPlanPanelExamples().uncertainWrite,canSave:true};const permissions=panelPermissions(state);
    expect(permissions.save).toBe(false);expect(permissions.open).toBe(false);expect(permissions.manage).toBe(false);expect(permissions.retry).toBe(true);
    expect(cloudMessage(state)).toContain('Retry the same request');
  });
  it('disables all service actions while loading or saving',()=>{
    const fixtures=cloudPlanPanelExamples();
    for(const state of [fixtures.loading,fixtures.saving]){
      const p=panelPermissions({...state,canSave:true,lastSaved:fixtures.saved.lastSaved});
      expect(p.save).toBe(false);expect(p.open).toBe(false);expect(p.manage).toBe(false);expect(p.link).toBe(false);
    }
  });
  it('uses one unavailable-link message and preserves the local status',()=>{
    const html=render(cloudPlanPanelExamples().unavailableLink);
    expect(html).toContain('incorrect, expired, deleted, or replaced');expect(html).toContain('Saved in this browser');expect(html).not.toContain('Your current plan is saved online.');
  });
  it('explains size, validation, rate limiting and service errors without echoing input',()=>{
    const base=cloudPlanPanelExamples().localOnly;
    expect(cloudMessage({...base,cloud:{kind:'error',error:{code:'PAYLOAD_TOO_LARGE',status:413}}})).toContain('too large');
    expect(cloudMessage({...base,cloud:{kind:'error',error:{code:'INVALID_DOCUMENT',status:422,issues:[]}}})).toContain('Review your amounts');
    expect(cloudMessage({...base,cloud:{kind:'error',error:{code:'RATE_LIMITED',status:429,retryAfterSeconds:12}}})).toContain('12 seconds');
    expect(cloudMessage({...base,cloud:{kind:'error',error:{code:'UNAVAILABLE',status:503}}})).toContain('temporarily unavailable');
  });
});
