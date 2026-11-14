import { useEffect, useMemo, useRef, useState } from 'react';
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
import { loadSnapshot, saveSnapshot, STORAGE_KEY } from './state/storage';
import './styles.css';

const getPage = (): Page => location.hash === '#/compare' ? 'compare' : location.hash === '#/plan' ? 'plan' : location.hash === '#/move' ? 'move' : 'overview';
function PaymentDialog({ event, actual, onClose, onSave, onDelete }: { event: PaymentEvent; actual: boolean; onClose: () => void; onSave: (event: PaymentEvent) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(event.label);
  const [amount, setAmount] = useState(actual ? event.actual?.amountCents ?? event.amountCents : event.amountCents);
  const [date, setDate] = useState(actual ? event.actual?.date ?? event.date : event.date);
  const [kind, setKind] = useState(event.kind);
  const [confirmed, setConfirmed] = useState(event.confirmation === 'confirmed');
  const [error, setError] = useState('');
  return <Modal title={actual ? `Record actual: ${event.label}` : 'Edit payment'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); if (!label.trim() || !date || !Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) { setError('Enter a name, valid date and amount between $0 and $10,000,000.'); return; } onSave(actual ? { ...event, actual: { date, amountCents: amount } } : { ...event, label: label.trim(), date, amountCents: amount, kind, confirmation: confirmed ? 'confirmed' : 'proposed' }); }}>
    {actual ? <p className="modal-intro">Enter the total amount that actually changed hands. This replaces the planned payment; it is not added a second time.</p> : <label className="field">Payment name<input value={label} maxLength={120} onChange={e => setLabel(e.target.value)}/></label>}
    <div className="field-grid"><MoneyField label={actual ? 'Actual amount' : 'Amount'} value={amount} onChange={setAmount}/><DateField label={actual ? 'Actual date' : 'Payment date'} value={date} onChange={setDate}/></div>
    {!actual && <><label className="field">Payment type<select value={kind} onChange={e => setKind(e.target.value as PaymentEvent['kind'])}><option value="expense">Expense</option><option value="income">Income / payday</option><option value="refundable-deposit">Deposit paid out</option><option value="deposit-refund">Old deposit return</option></select></label><label className="check-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>The amount and date are confirmed</label></>}
    {error && <p role="alert" className="negative">{error}</p>}<div className="modal-actions">{actual ? event.actual && <button type="button" className="text-button negative" onClick={() => onSave({ ...event, actual: undefined })}>Clear actual</button> : <button type="button" className="text-button negative" onClick={onDelete}>Remove entry</button>}<button className="button primary" type="submit">{actual ? 'Record actual' : 'Update entry'}<Icon name="check" size={17}/></button></div>
  </form></Modal>;
}

export default function App() {
  const [initial] = useState(loadSnapshot);
  const [input, setInput] = useState<MoveInput>(() => initial.snapshot?.input ?? createExample());
  const [source, setSource] = useState<'example' | 'own' | 'saved'>(initial.snapshot ? 'saved' : 'example');
  const [selectedId, setSelectedId] = useState<string | null>(initial.snapshot?.selectedId ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(initial.snapshot?.savedAt ?? null);
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState<Page>(getPage);
  const previousPage = useRef(page);
  const [message, setMessage] = useState<string | null>(initial.error);
  const [dialog, setDialog] = useState<'help' | 'reset' | 'pass' | null>(null);
  const [editing, setEditing] = useState<{ event: PaymentEvent; actual: boolean } | null>(null);
  const [demoAccess, setDemoAccess] = useState(false);
  const result = useMemo(() => calculatePlans(input), [input]);
  const selected = result.plans.find(p => p.id === selectedId);
  useEffect(() => { const changed = () => { setPage(getPage()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => {
    document.title = `${({ overview: 'Overview', move: 'Move details', compare: 'Compare options', plan: 'Payment tracker' })[page]} · MoveGap`;
    if (previousPage.current !== page) document.getElementById('main-content')?.focus({ preventScroll: true });
    previousPage.current = page;
  }, [page]);
  const navigate = (next: Page) => { location.hash = `/${next}`; setPage(next); };
  const change = (next: MoveInput) => { setInput(next); setDirty(true); setMessage(null); };
  function startOwnMove() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setInput(createOwnMove()); setSource('own'); setSelectedId(null); setSavedAt(null);
      setDirty(true); setDemoAccess(false); setEditing(null); setMessage(null); navigate('move');
      window.scrollTo(0, 0);
    } catch { setMessage('The saved plan could not be removed. Your current move has been kept.'); }
  }
  function updateEvent(id: string, replacement?: PaymentEvent) {
    if (!replacement) {
      const reason = paymentRemovalReason(input, [id]);
      if (reason) { setMessage(reason); return; }
    }
    const update = (events: PaymentEvent[]) => replacement ? events.map(e => e.id === id ? replacement : e) : events.filter(e => e.id !== id);
    change({ ...input, commonEvents: update(input.commonEvents), housingOptions: input.housingOptions.map(h => ({ ...h, events: update(h.events) })), movingOptions: input.movingOptions.map(m => ({ ...m, events: update(m.events) })) }); setEditing(null);
  }
  function record(id: string) {
    const event = [...input.commonEvents, ...input.housingOptions.flatMap(h => h.events), ...input.movingOptions.flatMap(m => m.events)].find(e => e.id === id);
    if (event) setEditing({ event, actual: true });
  }
  function save() {
    if (!selected || result.errors.length) { setMessage('Choose a valid plan before saving.'); return; }
    try { const timestamp = new Date().toISOString(); saveSnapshot({ input, selectedId: selected.id, savedAt: timestamp }); setSavedAt(timestamp); setDirty(false); setMessage('Plan saved in this browser. You can safely close this tab.'); }
    catch { setMessage('This browser could not save your plan. Your changes are still visible, but will be lost if you close this tab.'); }
  }
  const requestSave = () => demoAccess || savedAt ? save() : setDialog('pass');
  return <WorkspaceShell page={page} saved={Boolean(savedAt) && !dirty} dirty={dirty} hasPlan={Boolean(selected)} source={source} onSave={requestSave} onReset={() => setDialog('reset')} onHelp={() => setDialog('help')}>
    {message && <div className="workspace-message" role="status"><Icon name="info" size={18}/><span>{message}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setMessage(null)}><Icon name="close" size={17}/></button></div>}
    {page === 'overview' && <OverviewPage input={input} result={result} selected={selected} source={source} onEdit={() => navigate('move')} onCompare={() => navigate('compare')} onTrack={() => navigate('plan')}/>}
    {page === 'move' && <YourMovePage input={input} onChange={change} onStartOwn={startOwnMove} source={source} onCompare={() => navigate('compare')} onRecordActual={record} preview={result.plans[0]} errors={result.errors}/>}
    {page === 'compare' && <ComparePlansPage input={input} result={result} onBack={() => navigate('move')} onChoose={id => { setSelectedId(id); setDirty(true); navigate('plan'); }}/>}
    {page === 'plan' && <YourPlanPage input={input} plan={selected} onCompare={() => navigate('compare')} onSave={requestSave} onRecord={record} savedAt={savedAt} dirty={dirty}/>}
    {editing && <PaymentDialog key={`${editing.event.id}-${editing.actual}`} {...editing} onClose={() => setEditing(null)} onSave={event => updateEvent(event.id, event)} onDelete={() => updateEvent(editing.event.id)}/>}
    {dialog === 'help' && <Modal title="A little clarity before a big move." onClose={() => setDialog(null)}><ol className="help-steps"><li><strong>Start with your numbers.</strong><p>Enter available cash, paydays, bills and confirmed moving options.</p></li><li><strong>Compare the full cash picture.</strong><p>Look at the lowest balance, your reserve and payment dates for each option.</p></li><li><strong>Keep track as it happens.</strong><p>Save a plan and replace planned payments with actual amounts and dates.</p></li></ol><div className="demo-disclosure">This is a working prototype with fictional example data. No money is charged. Results cover only your entered payments; deposit dates are estimates, not legal advice.</div></Modal>}
    {dialog === 'reset' && <Modal title="Start again with the example?" onClose={() => setDialog(null)}><p className="modal-intro">This removes the saved MoveGap plan from this browser and replaces your current entries with the fictional example.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Keep my plan</button><button className="button primary" onClick={() => { try { localStorage.removeItem(STORAGE_KEY); setInput(createExample()); setSource('example'); setSelectedId(null); setSavedAt(null); setDirty(false); setDemoAccess(false); setMessage(null); setDialog(null); navigate('move'); } catch { setMessage('The saved plan could not be removed. Nothing has been reset.'); setDialog(null); } }}>Reset example</button></div></Modal>}
    {dialog === 'pass' && <MovePassDialog
      onClose={() => setDialog(null)}
      onDemo={() => { setDemoAccess(true); save(); setDialog(null); }}
    />}
  </WorkspaceShell>;
}
