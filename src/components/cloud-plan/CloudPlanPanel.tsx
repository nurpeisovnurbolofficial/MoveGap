import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { CloudPlanPanelProps } from '../../contracts/cloudPlan';
import { CLOUD_PLAN_RETENTION_DAYS } from '../../contracts/cloudPlan';
import { cloudMessage, panelPermissions } from './panelPresentation';
import './CloudPlanPanel.css';

type Confirmation = 'save' | 'open' | 'load' | 'new' | 'delete' | 'rotate';
const confirmations: Record<Confirmation, {title: string; text: string; action: string}> = {
  save: {title:'Save this plan online?', text:'Your entered amounts, dates, payments and selected option will be stored on the server. Anyone with the private link can read and change this plan. No account is required.', action:'Save online'},
  open: {title:'Open a different saved plan?', text:'This replaces the plan you are viewing. Your current draft must be kept as a recovery copy before replacement. If it cannot be kept, opening must stop.', action:'Keep draft and open plan'},
  load: {title:'Load the newer online version?', text:'Your current changes must be kept as a local recovery copy first. The newer online version then becomes the plan you are viewing. Nothing is merged automatically.', action:'Keep my copy and load online version'},
  new: {title:'Save your changes as a separate plan?', text:'Your current version will be saved as a new online plan with its own private link. The existing online plan will not be overwritten. Save the new link after this succeeds.', action:'Save as a separate plan'},
  delete: {title:'Delete the online copy?', text:'The private link will stop working. This deletes only the online copy; it does not delete your local plan. This action cannot be undone.', action:'Delete online copy'},
  rotate: {title:'Replace the private link?', text:'The old link will stop working. Your plan stays online. Copy the new link after the change succeeds; people with the old link will no longer have access.', action:'Replace private link'},
};

function ConfirmAction({ kind, onCancel, onConfirm, fallback }: {kind:Confirmation; onCancel:()=>void; onConfirm:()=>void; fallback:RefObject<HTMLElement | null>}) {
  const dialog = useRef<HTMLDialogElement>(null); const cancel = useRef<HTMLButtonElement>(null); const id = useId(); const copy = confirmations[kind];
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current!; element.showModal(); cancel.current?.focus();
    return () => { element.close(); queueMicrotask(() => {
      const target = trigger instanceof HTMLElement && trigger.isConnected && !trigger.matches(':disabled') ? trigger : fallback.current;
      target?.focus({preventScroll:true});
    }); };
  }, [fallback]);
  return <dialog className="cloud-plan-confirm" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onCancel={event => {event.preventDefault();onCancel();}}>
    <h2 id={`${id}-title`}>{copy.title}</h2><p id={`${id}-body`}>{copy.text}</p><div className="cloud-plan-confirm-actions"><button ref={cancel} type="button" onClick={onCancel}>Cancel</button><button type="button" className={kind === 'delete' ? 'cloud-danger' : 'cloud-primary'} onClick={onConfirm}>{copy.action}</button></div>
  </dialog>;
}

const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : 'Unavailable';

/** Controlled presentation only: all persistence, links and clipboard work belong
 * to the provided client callbacks. No network or storage in this component. */
export function CloudPlanPanel(props: CloudPlanPanelProps) {
  const {state} = props; const permissions = panelPermissions(state); const id = useId();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [linkToOpen, setLinkToOpen] = useState(''); const [openError, setOpenError] = useState('');
  const [reveal, setReveal] = useState(false); const [waiting, setWaiting] = useState(false); const [actionError, setActionError] = useState('');
  const root = useRef<HTMLElement>(null); const locked = useRef(false);
  const identity = `${state.lastSaved?.planId ?? 'local'}:${state.lastSaved?.revision ?? 0}`;
  const confirmationIdentity = useRef(identity);
  const operation = state.cloud.kind === 'saving' ? state.cloud.operation : '';
  useEffect(() => { locked.current=false; setWaiting(false); setActionError(''); }, [state.cloud, operation, state.lastSaved]);
  useEffect(() => { setConfirmation(null); setReveal(false); }, [state.lastSaved?.planId]);
  useEffect(() => { if (state.copyStatus === 'failed') setReveal(true); }, [state.copyStatus]);
  const blocked = permissions.busy || waiting;
  function invoke(action: () => void) {
    if (locked.current || permissions.busy) return;
    locked.current=true; setWaiting(true); setActionError('');
    try { action(); } catch { locked.current=false;setWaiting(false);setActionError('The action could not be started. Your current plan is still open. Please try again.'); }
  }
  function confirm() {
    const action = confirmation; setConfirmation(null);
    if (confirmationIdentity.current !== identity) { setActionError('The online plan changed. Review it before trying this action again.'); return; }
    if (action === 'save' && permissions.save) invoke(props.onSave);
    if (action === 'open' && permissions.open) { invoke(() => props.onOpenLink(linkToOpen.trim())); setLinkToOpen(''); }
    if (action === 'load' && permissions.conflict) invoke(props.onLoadServerVersion);
    if (action === 'new' && permissions.conflict) invoke(props.onSaveLocalAsNew);
    if (action === 'delete' && permissions.manage) {setReveal(false);invoke(props.onDeleteCloudCopy);}
    if (action === 'rotate' && permissions.manage) {setReveal(false);invoke(props.onRotateLink);}
  }
  function requestConfirmation(kind: Confirmation) { confirmationIdentity.current=identity; setConfirmation(kind); }
  const localText = state.local.kind === 'saved' ? `Saved in this browser · ${timestamp(state.local.savedAt)}`
    : state.local.kind === 'saving' ? 'Saving your draft in this browser…'
    : state.local.kind === 'error' ? 'This browser could not save your draft. Keep this page open and resolve the local saving error.' : 'Your latest draft has not been saved in this browser yet.';
  const isError = state.cloud.kind === 'error' || state.cloud.kind === 'conflict';
  return <section className="cloud-plan-panel" ref={root} tabIndex={-1} aria-labelledby={`${id}-title`}>
    <header><h2 id={`${id}-title`}>Save and open your plan</h2><p>Save online to open the same plan in another browser. No registration required.</p></header>
    <div className={`cloud-local-status${state.local.kind === 'error' ? ' cloud-is-error' : ''}`} role="status"><strong>This browser</strong><p>{localText}</p></div>
    <div className={`cloud-online-status${isError ? ' cloud-is-error' : ''}`} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}><strong>Online copy</strong><p>{cloudMessage(state)}</p>{waiting && !permissions.busy && <p>Waiting for the service to respond…</p>}{actionError && <p>{actionError}</p>}</div>
    {state.lastSaved && <dl className="cloud-saved-meta"><div><dt>Last saved online</dt><dd>{timestamp(state.lastSaved.savedAt)}</dd></div><div><dt>Online copy expires</dt><dd>{timestamp(state.lastSaved.expiresAt)}</dd></div></dl>}
    <p className="cloud-privacy">Anyone with your private link can <strong>read and change</strong> this plan. Keep it somewhere safe. There is no email recovery if you lose it. Online copies expire after {CLOUD_PLAN_RETENTION_DAYS} days without a successful save.</p>
    {permissions.conflict ? <div className="cloud-conflict-actions"><p>Your changes and the online version have not been merged. Choose what to do next:</p><button type="button" disabled={blocked} onClick={() => requestConfirmation('load')}>Keep my copy and load online version</button><button type="button" disabled={blocked} onClick={() => requestConfirmation('new')}>Save my version as a separate plan</button></div> : <>
      <div className="cloud-main-actions"><button type="button" className="cloud-primary" disabled={!permissions.save || blocked} aria-describedby={state.cannotSaveReason ? `${id}-save-help` : undefined} onClick={() => state.lastSaved ? invoke(props.onSave) : requestConfirmation('save')}>Save online</button><button type="button" disabled={!permissions.link || blocked} onClick={props.onCopyLink}>Copy private link</button></div>
      {state.cannotSaveReason && <p className="cloud-help" id={`${id}-save-help`}>{state.cannotSaveReason}</p>}
    </>}
    {permissions.retry && <button type="button" disabled={blocked} onClick={() => invoke(props.onRetry)}>Retry the same request</button>}
    {permissions.link && state.copyStatus !== 'idle' && <p role="status" className="cloud-copy-status">{state.copyStatus === 'copied' ? 'Private link copied. Keep it somewhere safe.' : 'The link could not be copied. Use the manual copy option below.'}</p>}
    {permissions.link && <div className="cloud-manual-copy"><button type="button" disabled={blocked} onClick={() => {setReveal(true);props.onRevealLink();}}>Show link for manual copy</button>
      {reveal && (state.privateLink ? <><label htmlFor={`${id}-private`}>Private link — anyone with it can edit your plan</label><input id={`${id}-private`} type="text" value={state.privateLink} readOnly spellCheck={false} autoComplete="off" onFocus={event => event.target.select()}/><button type="button" onClick={()=>setReveal(false)}>Hide link</button></> : <p role="status">The link is not available yet. Try showing it again.</p>)}
    </div>}
    <details className="cloud-open"><summary>Open a saved plan</summary><form onSubmit={event => {event.preventDefault();if(!permissions.open || blocked)return;if(!linkToOpen.trim()){setOpenError('Paste your private plan link first.');return;}setOpenError('');requestConfirmation('open');}}>
      <label htmlFor={`${id}-open`}>Private plan link</label><input id={`${id}-open`} type="password" value={linkToOpen} onChange={event=>{setLinkToOpen(event.target.value);setOpenError('');}} autoComplete="off" spellCheck={false} disabled={!permissions.open || blocked} aria-invalid={!!openError} aria-describedby={openError ? `${id}-open-error` : undefined}/>
      {openError && <p id={`${id}-open-error`} role="alert">{openError}</p>}<p className="cloud-help">Only open links you trust. Your current draft must be kept before another plan replaces it.</p><button type="submit" disabled={!permissions.open || blocked}>Open saved plan</button>
    </form></details>
    {state.lastSaved && <details className="cloud-manage"><summary>Manage online copy</summary><p>These actions affect the online copy and its private link. They do not delete your local draft.</p><button type="button" disabled={!permissions.manage || blocked} onClick={()=>requestConfirmation('rotate')}>Replace private link</button><button type="button" className="cloud-danger" disabled={!permissions.manage || blocked} onClick={()=>requestConfirmation('delete')}>Delete online copy</button></details>}
    {confirmation && <ConfirmAction kind={confirmation} onCancel={()=>setConfirmation(null)} onConfirm={confirm} fallback={root}/>}
  </section>;
}
