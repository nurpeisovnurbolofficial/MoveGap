import { useDraftField } from '../../state/WorkspaceContext';
import { useId, useState } from 'react';
import type { Confirmation } from '../../domain/types';
import { addDays } from '../../domain/engine';
import { DateField, Icon, Modal } from '../../shared/ui';
import { shortDate } from '../../shared/format';
import { validDate } from './inputHelpers';

export interface OptionDraft { label: string; date: string; confirmation: Confirmation }
export function OptionEditor({ kind, initial, isNew, startDate, latestMoveDate, onSave, onClose }: {
  kind: 'housing' | 'moving'; initial: OptionDraft; isNew: boolean; startDate: string; latestMoveDate: string;
  onSave: (draft: OptionDraft) => void; onClose: () => void;
}) {
  const [label, setLabel] = useDraftField('option.label', initial.label);
  const [date, setDate] = useDraftField('option.date', initial.date);
  const [confirmation, setConfirmation] = useDraftField('option.confirmation', initial.confirmation);
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  const windowEnd = validDate(startDate) ? addDays(startDate, 59) : '';
  let dateError = !validDate(date) ? 'Choose a valid date.' : '';
  if (!dateError && kind === 'moving' && validDate(startDate) && (date < startDate || date > windowEnd)) dateError = `Choose a moving date from ${shortDate(startDate)} to ${shortDate(windowEnd)}.`;
  if (!dateError && kind === 'moving' && validDate(latestMoveDate) && date > latestMoveDate) dateError = `Choose a date on or before ${shortDate(latestMoveDate)}, or edit your latest move date first.`;
  const labelError = !label.trim() ? 'Give this option a name.' : '';
  return <Modal title={`${isNew ? 'Add' : 'Edit'} ${kind === 'housing' ? 'housing' : 'moving'} option`} onClose={onClose}>
    <p className="modal-intro">{kind === 'housing' ? 'A set of terms for one home: when it is available and what you will pay.' : 'One way to move your belongings, including moving yourself.'}</p>
    <form noValidate onSubmit={e => { e.preventDefault(); setSubmitted(true); if (!labelError && !dateError) onSave({ label: label.trim(), date, confirmation }); }}>
      <label className="field" htmlFor={id}>Option name<input id={id} autoFocus maxLength={120} value={label} placeholder={kind === 'housing' ? 'e.g. Oak Street — December lease' : 'e.g. Rent a van on Saturday'} onChange={e => setLabel(e.target.value)} aria-invalid={submitted && Boolean(labelError)}/>{submitted && labelError && <span className="move-field-error">{labelError}</span>}</label>
      <div className="move-option-date"><DateField label={kind === 'housing' ? 'Home available from' : 'Moving date'} value={date} onChange={setDate} error={submitted ? dateError : undefined}/></div>
      <label className="check-field"><input type="checkbox" checked={confirmation === 'confirmed'} onChange={e => setConfirmation(e.target.checked ? 'confirmed' : 'proposed')}/>These dates and terms are confirmed</label>
      <p className="move-inline-note"><Icon name="info" size={16}/>{isNew ? 'Next, add this option’s payment amounts and deadlines. Enter a $0 payment if there is no cost.' : 'Changing this date leaves all payment deadlines unchanged. Edit each payment separately if its terms have changed.'}</p>
      {submitted && (labelError || dateError) && <p role="alert" className="move-field-error">Check the highlighted fields before saving.</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary">{isNew ? 'Create option' : 'Save option'}<Icon name="check" size={17}/></button></div>
    </form>
  </Modal>;
}
