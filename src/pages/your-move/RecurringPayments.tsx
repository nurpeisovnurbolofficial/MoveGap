import { useRef, useState } from 'react';
import type { MoveInput } from '../../domain/types';
import { addDays } from '../../domain/engine';
import { DateField, Modal, MoneyField } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { useDraftField } from '../../state/WorkspaceContext';
import { validDate } from './inputHelpers';
import { seriesPreview, type Frequency, type SeriesDraft } from './scheduleHelpers';

export function RecurringPayments({ input, onAdd, onClose }: { input: MoveInput; onAdd: (draft: SeriesDraft) => void; onClose: () => void }) {
  const [template, setTemplate] = useDraftField('series.template', 'pay');
  const [label, setLabel] = useDraftField('series.label', 'Take-home pay');
  const [amount, setAmount] = useDraftField('series.amount', NaN);
  const [first, setFirst] = useDraftField('series.first', input.startDate);
  const [last, setLast] = useDraftField('series.last', validDate(input.startDate) ? addDays(input.startDate, 59) : '');
  const [frequency, setFrequency] = useDraftField<Frequency>('series.frequency', 'biweekly');
  const [kind, setKind] = useDraftField<'income' | 'expense'>('series.kind', 'income');
  const [confirmed, setConfirmed] = useDraftField('series.confirmed', false);
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const draft: SeriesDraft = { label, amountCents: amount, firstDate: first, lastDate: last, frequency, kind, confirmed };
  let preview: ReturnType<typeof seriesPreview> | null = null, issue = '';
  try { preview = seriesPreview(input, draft); } catch (e) { issue = (e as Error).message; }
  return <Modal title="Add repeating payments" onClose={onClose}>
    <p className="modal-intro">Enter an amount once, then review every date. These become individual editable payments, not automatic charges.</p>
    <form noValidate onSubmit={event => { event.preventDefault(); if (submitted.current) return; if (!preview?.added) { setError(issue || 'These entries are already in your shared payments.'); return; } submitted.current = true; try { onAdd(draft); } catch (e) { submitted.current = false; setError((e as Error).message); } }}>
      <label className="field">Start with a template<select value={template} onChange={event => { const template = event.target.value; setTemplate(template); setLabel(template === 'pay' ? 'Take-home pay' : template === 'rent' ? 'Old rent' : template === 'living' ? 'Everyday spending' : 'Utilities'); setKind(template === 'pay' ? 'income' : 'expense'); setFrequency(template === 'pay' ? 'biweekly' : template === 'living' ? 'weekly' : 'monthly'); }}><option value="pay">Payday</option><option value="rent">Old rent</option><option value="living">Everyday spending</option><option value="utilities">Utilities</option></select></label>
      <label className="field">Series name<input value={label} maxLength={120} onChange={e => setLabel(e.target.value)}/></label>
      <div className="field-grid"><MoneyField draftKey="series.raw" label="Amount each time" value={amount} onChange={setAmount}/><label className="field">Repeat<select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}><option value="weekly">Every week</option><option value="biweekly">Every two weeks</option><option value="monthly">Every month</option></select></label></div>
      <div className="field-grid"><DateField label="First payment" value={first} onChange={setFirst}/><DateField label="Repeat through" value={last} onChange={setLast}/></div>
      <label className="field">Money direction<select value={kind} onChange={e => setKind(e.target.value as 'income' | 'expense')}><option value="income">Money in</option><option value="expense">Money out</option></select></label>
      <label className="check-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I have checked these amounts and dates</label>
      <p className="field-hint">Monthly dates keep the original day, using the last day of a shorter month. Check holidays and when money actually clears. Unconfirmed income stays out of the forecast.</p>
      {preview ? <section className="series-preview" aria-label="Payment preview"><strong>{preview.added} payments to add · {money(preview.totalCents)} {kind === 'income' ? 'in' : 'out'}</strong><ul>{preview.rows.map(row => <li key={row.date}><span>{shortDate(row.date)}</span><span>{row.duplicate ? 'Already listed — skipped' : money(amount)}</span></li>)}</ul>{preview.skipped > 0 && <p>Matching name, date, amount and type are skipped. Existing records are not changed.</p>}</section> : <p className="field-hint" role="status">{issue}</p>}
      {error && <p className="negative" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={!preview?.added}>Add {preview?.added ?? 0} payments</button></div>
    </form>
  </Modal>;
}
