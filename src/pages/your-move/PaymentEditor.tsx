import { useId, useState } from 'react';
import type { MoveInput, PaymentEvent, PaymentOwner } from '../../domain/types';
import { getActualCandidates, paymentRemovalReason } from '../../domain/payments';
import { DateField, Icon, Modal, MoneyField } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { paymentTimingNote, validDate, validMoney } from './inputHelpers';

export function PaymentEditor({ event, isNew, containerLabel, startDate, allowedKinds, input, owner, onEditActual, onSave, onClose, onRemove }: {
  event: PaymentEvent; isNew: boolean; containerLabel: string; startDate: string;
  input: MoveInput; owner: PaymentOwner; onEditActual: () => void;
  allowedKinds: PaymentEvent['kind'][];
  onSave: (event: PaymentEvent) => void; onClose: () => void; onRemove: () => void;
}) {
  const [label, setLabel] = useState(event.label);
  const [amount, setAmount] = useState(event.amountCents);
  const [date, setDate] = useState(event.date);
  const [kind, setKind] = useState(event.kind);
  const [confirmed, setConfirmed] = useState(event.confirmation === 'confirmed');
  const [submitted, setSubmitted] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [links, setLinks] = useState(event.actualLinks ?? {});
  const id = useId();
  const errors = [!label.trim() && 'Add a payment name.', !validMoney(amount) && 'Enter an amount from $0 to $10,000,000, with at most two decimals.', !validDate(date) && 'Choose a valid payment date.', Object.values(links).filter(value => value === 'same-payment').length > 1 && 'Only one recorded payment can cover this planned payment.'].filter(Boolean);
  const draft: PaymentEvent = { ...event, label: label.trim(), amountCents: amount, date, kind, confirmation: confirmed ? 'confirmed' : 'proposed', actualLinks: Object.keys(links).length ? links : undefined };
  const candidates = event.actual ? [] : getActualCandidates(input, owner, draft);
  const removalReason = paymentRemovalReason(input, [event.id]);
  const timingNote = paymentTimingNote(draft, startDate);
  const kindLabels: Record<PaymentEvent['kind'], string> = { expense: 'Expense', income: 'Income / payday', 'refundable-deposit': 'Deposit paid out', 'deposit-refund': 'Old deposit return' };
  const kinds = [...new Set([...allowedKinds, event.kind])];
  return <Modal title={isNew ? 'Add a payment' : 'Edit planned payment'} onClose={onClose}>
    <p className="modal-intro move-editor-context">{containerLabel}. Recorded payments remain in your history when you change moving options.</p>
    <form noValidate onSubmit={e => { e.preventDefault(); setSubmitted(true); if (!errors.length) onSave(draft); }}>
      <label className="field" htmlFor={`${id}-name`}>Payment name<input id={`${id}-name`} autoFocus value={label} maxLength={120} placeholder="e.g. First month rent" aria-invalid={submitted && !label.trim()} onChange={e => setLabel(e.target.value)}/></label>
      <div className="field-grid"><MoneyField label="Amount" value={amount} onChange={setAmount} error={submitted && !validMoney(amount) ? 'Enter a valid dollar amount, including $0 if there is no charge.' : undefined}/><DateField label="Payment date" value={date} onChange={setDate} error={submitted && !validDate(date) ? 'Choose a valid date.' : undefined}/></div>
      <label className="field" htmlFor={`${id}-type`}>Payment type<select id={`${id}-type`} value={kind} disabled={Boolean(event.actual) || kinds.length === 1} onChange={e => { setKind(e.target.value as PaymentEvent['kind']); setLinks({}); }}>{kinds.map(value => <option key={value} value={value}>{kindLabels[value]}</option>)}</select></label>
      {candidates.length > 0 && <fieldset className="move-payment-links"><legend>Check recorded payments</legend><p>Is this an additional obligation, or has the same payment already been made? Unreviewed overlaps keep the plan conditional.</p>{candidates.map(row => <label className="field" key={row.event.id}>Relationship to {row.event.label} — {row.ownerLabel}<span className="field-hint">{row.event.actual ? `${money(row.event.actual.amountCents)} recorded on ${shortDate(row.effectiveDate)}` : 'The linked actual was cleared. Review or remove this relationship.'}</span><select value={links[row.event.id] ?? ''} onChange={e => setLinks(old => { const next = { ...old }; if (e.target.value) next[row.event.id] = e.target.value as 'same-payment' | 'separate-payment'; else delete next[row.event.id]; return next; })}><option value="">Not reviewed</option><option value="separate-payment">Separate payment — still due</option>{row.event.actual && <option value="same-payment">Same payment — already fully paid</option>}{!row.event.actual && links[row.event.id] === 'same-payment' && <option value="same-payment">Previous link — actual no longer recorded</option>}</select></label>)}</fieldset>}
      {kind !== 'deposit-refund' && <label className="check-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>The amount and date are confirmed</label>}
      {timingNote && <p className="move-inline-note"><Icon name="info" size={16}/>{timingNote}</p>}
      {event.actual && <><p className="move-inline-note"><Icon name="info" size={16}/>Actual recorded: {money(event.actual.amountCents)} on {shortDate(event.actual.date)}. Editing the plan keeps that actual amount.</p><button type="button" className="button secondary" onClick={onEditActual}>Edit recorded payment</button></>}
      {!isNew && removalReason && <p className="move-inline-note">{removalReason}</p>}
      {submitted && errors.length > 0 && <div className="move-field-error" role="alert">{errors.map(error => <p key={String(error)}>{error}</p>)}</div>}
      {confirmRemove ? <div className="move-remove-confirm"><p>Remove this unpaid entry? The forecast will be recalculated.</p><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setConfirmRemove(false)}>Keep payment</button><button type="button" className="button move-danger-button" disabled={Boolean(removalReason)} onClick={onRemove}>Remove payment</button></div></div> : <div className="modal-actions">{!isNew && !removalReason && <button type="button" className="text-button negative" onClick={() => setConfirmRemove(true)}>Remove payment</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{isNew ? 'Add payment' : 'Save payment'}<Icon name="check" size={17}/></button></div>}
    </form>
  </Modal>;
}
