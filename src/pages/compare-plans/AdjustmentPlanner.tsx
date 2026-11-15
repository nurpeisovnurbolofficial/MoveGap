import { useEffect, useRef, useState } from 'react';
import type { MoveInput, PlanResult } from '../../domain/types';
import { adjustablePayments, applyAdjustment, findAdjustments, stressAdjustment, type Adjustment, type PaymentWindow } from '../../domain/adjustments';
import { DateField, Modal, MoneyField } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { useDraftField } from '../../state/WorkspaceContext';
import './AdjustmentPlanner.css';
import { searchInBackground } from './adjustmentSearch';

export function AdjustmentPlanner({ input, plan, number, onApply }: { input: MoveInput; plan: PlanResult; number: number; onApply?: (next: MoveInput, expected: MoveInput) => Promise<void> }) {
  const prefix = `adjust.${plan.id}.`;
  const [windows, setWindows] = useDraftField<PaymentWindow[]>(`${prefix}windows`, []);
  const [cap, setCap] = useDraftField(`${prefix}cap`, 0);
  const [maxChanges, setMaxChanges] = useDraftField<1 | 2>(`${prefix}count`, 1);
  const [result, setResult] = useState<{ signature: string; value: ReturnType<typeof findAdjustments> } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const searchAbort = useRef<AbortController | null>(null);
  useEffect(() => () => searchAbort.current?.abort(), []);
  const [confirm, setConfirm] = useState<Adjustment | null>(null);
  const [delay, setDelay] = useDraftField(`${prefix}delay`, 0);
  const [incomeId, setIncomeId] = useDraftField(`${prefix}income`, '');
  const [extra, setExtra] = useDraftField(`${prefix}extra`, 0);
  const [extraDate, setExtraDate] = useDraftField(`${prefix}extraDate`, plan.moveDate);
  const [message, setMessage] = useState('');
  const payments = adjustablePayments(input, plan);
  const signature = JSON.stringify({ input, windows, cap, maxChanges });
  const shown = result?.signature === signature ? result.value : null;
  const incomes = plan.timeline.filter(row => row.kind === 'income' && !row.isActual);
  const selectedIncome = incomes.some(row => row.eventId === incomeId) ? incomeId : incomes[0]?.eventId ?? '';
  const update = (eventId: string, patch: Partial<PaymentWindow>) => setWindows(old => old.map(w => w.eventId === eventId ? { ...w, ...patch } : w));
  async function search() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    const controller = new AbortController(); searchAbort.current = controller;
    try { const value = await searchInBackground(input, { planId: plan.id, windows, maxChanges, maxFeeCents: cap }, controller.signal); setResult({ signature, value }); }
    catch (e) { setError((e as Error).message); }
    finally { searchAbort.current = null; locked.current = false; setBusy(false); }
  }
  return <section className="adjustment-planner panel" aria-labelledby="adjustment-title">
    <div className="panel-heading"><h2 id="adjustment-title">Find payment changes for Plan {number}</h2><span className="badge amber">Explore before agreeing</span></div>
    <p>Choose up to two unpaid payments and the dates you could discuss. We test every date in those ranges. Other payments, moving dates and recorded transactions stay fixed.</p>
    <details className="adjustment-setup"><summary>Set allowed changes</summary>
      <p>Only tick payments you could reschedule. A possible date is not permission to pay late. Enter the full extra fee and its due date if changing the deadline costs money.</p>
      <div className="adjustment-payments">{payments.map(event => {
        const rule = windows.find(w => w.eventId === event.id);
        return <fieldset key={event.id}><legend><label className="check-field"><input type="checkbox" checked={!!rule} disabled={busy || (!rule && windows.length >= 2)} onChange={e => setWindows(old => e.target.checked ? [...old, { eventId: event.id, earliest: event.date, latest: event.date, feeCents: 0, feeDate: event.date }] : old.filter(w => w.eventId !== event.id))}/>{event.label} · {money(event.amountCents)} · {shortDate(event.date)}</label></legend>
          {rule && <div className="adjustment-rule"><div className="field-grid"><DateField label={`Earliest date for ${event.label}`} value={rule.earliest} onChange={earliest => update(event.id, { earliest })}/><DateField label={`Latest date for ${event.label}`} value={rule.latest} onChange={latest => update(event.id, { latest })}/></div><div className="field-grid"><MoneyField label={`Extra fee for ${event.label}`} value={rule.feeCents} onChange={feeCents => update(event.id, { feeCents })}/><DateField label={`Fee due for ${event.label}`} value={rule.feeDate} onChange={feeDate => update(event.id, { feeDate })}/></div><p className="field-hint">The fee is charged once only if this deadline changes. Existing payment amount stays the same.</p></div>}
        </fieldset>;
      })}</div>
      {!payments.length && <p>No unpaid, unlinked expenses in this plan can be moved.</p>}
      {windows.some(w => !payments.some(e => e.id === w.eventId)) && <p className="negative">A selected payment is no longer editable. <button className="text-button" onClick={() => setWindows(old => old.filter(w => payments.some(e => e.id === w.eventId)))}>Remove unavailable selections</button></p>}
      <div className="field-grid"><label className="field">Maximum payments to change<select value={maxChanges} onChange={e => setMaxChanges(Number(e.target.value) as 1 | 2)}><option value="1">One payment</option><option value="2">Two payments</option></select></label><MoneyField draftKey={`${prefix}cap.raw`} label="Maximum extra fees" value={cap} onChange={setCap}/></div>
      <button className="button primary" disabled={busy || !windows.length} onClick={() => void search()}>{busy ? 'Checking allowed dates…' : 'Find permitted changes'}</button>
      {busy && searchAbort.current && <button className="text-button" onClick={() => searchAbort.current?.abort()}>Cancel search</button>}
    </details>
    {error && <p role="alert" className="negative">{error}</p>}
    {result && !shown && <p role="status">Your inputs changed. Search again to refresh the results.</p>}
    {shown && <div className="adjustment-results" aria-live="polite"><p><strong>{shown.tested} changed schedules tested.</strong> Results prioritise the smallest reserve shortfall, then fewer changes, lower fees and shorter date shifts. Unchanged deadlines are also allowed. This does not search other moving dates or negotiate terms.</p>
      {!shown.candidates.length && <p className="notice">{shown.baseline.meetsReserve ? 'This plan already keeps your reserve. No deadline change is needed for the entered schedule.' : 'No tested change improves the reserve shortfall within your limits. We have not assumed a loan, early paycheck or deposit refund.'}</p>}
      {shown.candidates.length > 0 && <><details className="adjustment-stress"><summary>Stress-test these results</summary><p>This changes the preview only. It does not predict the likelihood of a delay or add costs to your saved plan.</p><div className="field-grid"><label className="field">Income to delay<select value={selectedIncome} onChange={e => setIncomeId(e.target.value)}><option value="">Choose income</option>{incomes.map(row => <option key={row.eventId} value={row.eventId}>{row.label} · {shortDate(row.date)}</option>)}</select></label><label className="field">Income delay<select value={delay} onChange={e => setDelay(Number(e.target.value))}><option value="0">No delay</option><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label><MoneyField draftKey={`${prefix}extra.raw`} label="Unexpected expense" value={extra} onChange={setExtra}/><DateField label="Unexpected expense date" value={extraDate} onChange={setExtraDate}/></div></details>
        <div className="adjustment-cards">{shown.candidates.map((candidate, index) => {
          let stress: PlanResult | null = null, stressError = '';
          if (delay || extra !== 0) try { stress = stressAdjustment(input, candidate, selectedIncome, delay, extra, extraDate); } catch (e) { stressError = (e as Error).message; }
          return <article key={JSON.stringify(candidate.changes)} className="adjustment-card"><h3>Option {index + 1} · {candidate.changes.length} {candidate.changes.length === 1 ? 'change' : 'changes'}</h3><span className={`badge ${candidate.plan.meetsReserve ? 'amber' : 'red'}`}>{candidate.plan.meetsReserve ? 'Keeps reserve if agreed' : 'Still below reserve'}</span><ul>{candidate.changes.map(c => <li key={c.eventId}><strong>{c.label}</strong><span>{shortDate(c.from)} → {shortDate(c.to)}</span>{c.feeCents > 0 && <span>{money(c.feeCents)} fee due {shortDate(c.feeDate)}</span>}</li>)}</ul><dl><div><dt>Lowest cash</dt><dd>{money(candidate.plan.minBalanceCents)}</dd></div><div><dt>Extra fees</dt><dd>{money(candidate.feeCents)}</dd></div><div><dt>Still needed for reserve</dt><dd>{money(candidate.plan.gapToReserveCents)}</dd></div></dl><p>All changed deadlines and fees need confirmation. Other unconfirmed conditions still apply.</p>
            {stress && <p className={`adjustment-stress-result ${stress.meetsReserve ? '' : 'negative'}`}>Stress test: lowest cash {money(stress.minBalanceCents)}. {stress.meetsReserve ? 'Reserve survives these assumptions.' : `${money(stress.gapToReserveCents)} more needed for your reserve.`}</p>}{stressError && <p role="alert" className="negative">{stressError}</p>}
            {onApply && <button className="button secondary" disabled={busy} onClick={() => setConfirm(candidate)}>Review and apply option {index + 1}</button>}
          </article>;
        })}</div></>}
    </div>}
    {message && <p role="status">{message}</p>}
    {confirm && <Modal title="Apply as unconfirmed terms?" onClose={() => { if (!busy) setConfirm(null); }}><p>Your current draft will be kept as a local recovery copy. These deadlines and fees will replace the current plan’s terms, but stay unconfirmed until you review them in Move details. This does not change the actual moving date or contact anyone. Stress-test assumptions are not applied.</p><ul>{confirm.changes.map(c => <li key={c.eventId}>{c.label}: {shortDate(c.from)} → {shortDate(c.to)}; extra fee {money(c.feeCents)}{c.feeCents > 0 && ` due ${shortDate(c.feeDate)}`}</li>)}</ul><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button className="button primary" disabled={busy || !shown} onClick={() => { if (locked.current || !shown) return; locked.current = true; setBusy(true); setError(''); void (async () => { try { await onApply?.(applyAdjustment(input, confirm), input); setConfirm(null); setResult(null); setMessage('Changes applied as unconfirmed terms. Review them in Move details. Your earlier draft is available in recovery.'); } catch (e) { setError((e as Error).message); setConfirm(null); } finally { locked.current = false; setBusy(false); } })(); }}>Keep recovery copy and apply</button></div></Modal>}
  </section>;
}
