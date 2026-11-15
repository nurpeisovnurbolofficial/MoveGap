import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { calculatePlans } from './domain/engine';
import { createExample } from './domain/example';
import { paymentRemovalReason } from './domain/payments';
import type { MoveInput, PaymentEvent } from './domain/types';
import { WorkspaceShell, type Page } from './components/WorkspaceShell';
import { YourMovePage } from './pages/your-move/YourMovePage';
import { createOwnMove } from './pages/your-move/inputHelpers';
import { ComparePlansPage } from './pages/compare-plans/ComparePlansPage';
import { YourPlanPage } from './pages/your-plan/YourPlanPage';
import { MovePassDialog } from './pages/your-plan/MovePassDialog';
import { OverviewPage } from './pages/overview/OverviewPage';
import { DateField, Icon, Modal, MoneyField } from './shared/ui';
import { WorkspaceController } from './state/workspace';
import { WorkspaceProvider, useDraftField } from './state/WorkspaceContext';
import { WorkspaceStoragePanel } from './components/WorkspaceStoragePanel';
import type { CloudPlanAccess } from './contracts/cloudPlan';
import './styles.css';

const getPage = (): Page => location.hash === '#/compare' ? 'compare' : location.hash === '#/plan' ? 'plan' : location.hash === '#/move' ? 'move' : 'overview';
function PaymentDialog({ event, actual, onClose, onSave, onDelete }: { event: PaymentEvent; actual: boolean; onClose: () => void; onSave: (event: PaymentEvent) => void; onDelete: () => void }) {
  const [label, setLabel] = useDraftField(`actual.${event.id}.label`, event.label);
  const [amount, setAmount] = useDraftField(`actual.${event.id}.amount`, actual ? event.actual?.amountCents ?? event.amountCents : event.amountCents);
  const [date, setDate] = useDraftField(`actual.${event.id}.date`, actual ? event.actual?.date ?? event.date : event.date);
  const [kind, setKind] = useDraftField(`actual.${event.id}.kind`, event.kind);
  const [confirmed, setConfirmed] = useDraftField(`actual.${event.id}.confirmed`, event.confirmation === 'confirmed');
  const [error, setError] = useState('');
  return <Modal title={actual ? `Record actual: ${event.label}` : 'Edit payment'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); if (!label.trim() || !date || !Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) { setError('Enter a name, valid date and amount between $0 and $10,000,000.'); return; } onSave(actual ? { ...event, actual: { date, amountCents: amount } } : { ...event, label: label.trim(), date, amountCents: amount, kind, confirmation: confirmed ? 'confirmed' : 'proposed' }); }}>
    {actual ? <p className="modal-intro">Enter the total amount that actually changed hands. This replaces the planned payment; it is not added a second time.</p> : <label className="field">Payment name<input value={label} maxLength={120} onChange={e => setLabel(e.target.value)}/></label>}
    <div className="field-grid"><MoneyField draftKey={`actual.${event.id}.raw`} label={actual ? 'Actual amount' : 'Amount'} value={amount} onChange={setAmount}/><DateField label={actual ? 'Actual date' : 'Payment date'} value={date} onChange={setDate}/></div>
    {!actual && <><label className="field">Payment type<select value={kind} onChange={e => setKind(e.target.value as PaymentEvent['kind'])}><option value="expense">Expense</option><option value="income">Income / payday</option><option value="refundable-deposit">Deposit paid out</option><option value="deposit-refund">Old deposit return</option></select></label><label className="check-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>The amount and date are confirmed</label></>}
    {error && <p role="alert" className="negative">{error}</p>}<div className="modal-actions">{actual ? event.actual && <button type="button" className="text-button negative" onClick={() => onSave({ ...event, actual: undefined })}>Clear actual</button> : <button type="button" className="text-button negative" onClick={onDelete}>Remove entry</button>}<button className="button primary" type="submit">{actual ? 'Record actual' : 'Update entry'}<Icon name="check" size={17}/></button></div>
  </form></Modal>;
}

export default function App({ restoreAccess }: { restoreAccess: CloudPlanAccess | null }) {
  const [workspace] = useState(() => new WorkspaceController(localStorage, navigator.locks, restoreAccess));
  useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  useEffect(() => workspace.bind(), [workspace]);
  return <WorkspaceProvider controller={workspace}><WorkspaceApp key={workspace.epoch} workspace={workspace}/></WorkspaceProvider>;
}

function WorkspaceApp({ workspace }: { workspace: WorkspaceController }) {
  const input = workspace.input;
  const selectedId = workspace.selectedId;
  const source = workspace.source;
  const local = workspace.localStatus();
  const savedAt = local.kind === 'saved' ? local.savedAt : null;
  const dirty = local.kind !== 'saved';
  const [page, setPage] = useState<Page>(getPage);
  const previousPage = useRef(page);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'help' | 'reset' | 'pass' | null>(null);
  const [editing, setEditing] = useDraftField<{ event: PaymentEvent; actual: boolean } | null>('open.actual', null);
  const [demoAccess, setDemoAccess] = useDraftField('movePassDemo', false);
  const [pendingRecord, setPendingRecord] = useState<string | null>(null);
  const result = useMemo(() => calculatePlans(input), [input]);
  const selected = result.plans.find(p => p.id === selectedId);
  useEffect(() => { const changed = () => { setPage(getPage()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => {
    document.title = `${({ overview: 'Start', move: 'Your move', compare: 'Compare plans', plan: 'Track payments' })[page]} · MoveGap`;
    if (previousPage.current !== page) document.getElementById('main-content')?.focus({ preventScroll: true });
    previousPage.current = page;
  }, [page]);
  const navigate = (next: Page) => { location.hash = `/${next}`; setPage(next); };
  const change = (next: MoveInput) => { workspace.updateInput(next); setMessage(null); };
  async function startOwnMove() {
    try { await workspace.newMove(createOwnMove(), 'own'); navigate('move'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not start a new move. Your current draft was kept.'); }
  }
  function updateEvent(id: string, replacement?: PaymentEvent) {
    if (!replacement) {
      const reason = paymentRemovalReason(input, [id]);
      if (reason) { setMessage(reason); return; }
    }
    const update = (events: PaymentEvent[]) => replacement ? events.map(e => e.id === id ? replacement : e) : events.filter(e => e.id !== id);
    change({ ...input, commonEvents: update(input.commonEvents), housingOptions: input.housingOptions.map(h => ({ ...h, events: update(h.events) })), movingOptions: input.movingOptions.map(m => ({ ...m, events: update(m.events) })) }); workspace.clearFields(`actual.${id}.`); setEditing(null);
  }
  function record(id: string) {
    if (!demoAccess) { setPendingRecord(id); setDialog('pass'); return; }
    openRecord(id);
  }
  function openRecord(id: string) {
    const event = [...input.commonEvents, ...input.housingOptions.flatMap(h => h.events), ...input.movingOptions.flatMap(m => m.events)].find(e => e.id === id);
    if (event) setEditing({ event, actual: true });
  }
  async function save() {
    if (!await workspace.save()) setMessage('This draft could not be saved. Resolve the local storage warning below.');
    else setMessage('Your draft is saved in this browser. Online saving is separate and free.');
  }
  const requestSave = () => { void save(); };
  async function applyPaymentChanges(next: MoveInput, expected: MoveInput) {
    if (!workspace.completeDocument()) throw new Error('Finish open editors and resolve saving conflicts before applying changes.');
    if (JSON.stringify(workspace.input) !== JSON.stringify(expected)) throw new Error('Your move changed. Search again before applying.');
    const token = JSON.stringify(workspace.content);
    await workspace.archive();
    if (JSON.stringify(workspace.content) !== token) throw new Error('Your draft changed while it was being protected. Search again.');
    workspace.updateInput(next);
  }
  return <WorkspaceShell page={page} saved={Boolean(savedAt) && !dirty} dirty={dirty} hasPlan={true} source={source} onSave={requestSave} onReset={() => setDialog('reset')} onHelp={() => setDialog('help')}>
    {message && <div className="workspace-message" role="status"><Icon name="info" size={18}/><span>{message}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setMessage(null)}><Icon name="close" size={17}/></button></div>}
    {page === 'overview' && <OverviewPage input={input} result={result} selected={selected} source={source} onEdit={() => navigate('move')} onCompare={() => navigate('compare')} onTrack={() => navigate('plan')}/>}
    {page === 'move' && <YourMovePage input={input} onChange={change} onStartOwn={startOwnMove} source={source} onCompare={() => navigate('compare')} onRecordActual={record} preview={result.plans[0]} errors={result.errors}/>}
    {page === 'compare' && <ComparePlansPage input={input} result={result} currentPlanId={selectedId} onBack={() => navigate('move')} onChoose={id => { workspace.select(id); navigate('plan'); }} onApplyAdjustment={applyPaymentChanges}/>}
    {page === 'plan' && <YourPlanPage input={input} plan={selected} onCompare={() => navigate('compare')} onSave={requestSave} onRecord={record} savedAt={savedAt} dirty={dirty} movePass={demoAccess} onUnlock={() => setDialog('pass')}/>}
    {editing && <PaymentDialog key={`${editing.event.id}-${editing.actual}`} {...editing} onClose={() => { workspace.clearFields(`actual.${editing.event.id}.`); setEditing(null); }} onSave={event => updateEvent(event.id, event)} onDelete={() => updateEvent(editing.event.id)}/>}
    {dialog === 'help' && <Modal title="A little clarity before a big move." onClose={() => setDialog(null)}><ol className="help-steps"><li><strong>Start with your numbers.</strong><p>Enter available cash, paydays, bills and confirmed moving options.</p></li><li><strong>Compare the full cash picture.</strong><p>Look at the lowest balance, your reserve and payment dates for each option.</p></li><li><strong>Keep track as it happens.</strong><p>Save a plan and replace planned payments with actual amounts and dates.</p></li></ol><div className="demo-disclosure">This is a working prototype with fictional example data. No money is charged. Results cover only your entered payments; deposit dates are estimates, not legal advice.</div></Modal>}
    {(page === 'overview' || (page === 'plan' && selected) || workspace.draft.status === 'conflict' || workspace.error) && <WorkspaceStoragePanel workspace={workspace}/>}
    {dialog === 'reset' && <Modal title="Start again with the example?" onClose={() => setDialog(null)}><p className="modal-intro">Your current draft will be kept as a recovery copy before the fictional example is opened. Existing online plans will not be deleted.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Keep my plan</button><button className="button primary" onClick={() => { void workspace.newMove(createExample(), 'example').then(() => { setDialog(null); navigate('move'); }).catch(error => setMessage(error.message)); }}>Reset example</button></div></Modal>}
    {dialog === 'pass' && <MovePassDialog
      onClose={() => setDialog(null)}
      onDemo={() => { setDemoAccess(true); setDialog(null); if (pendingRecord) openRecord(pendingRecord); setPendingRecord(null); }}
    />}
  </WorkspaceShell>;
}
