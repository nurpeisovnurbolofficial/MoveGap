import { useState } from 'react';
import type { HousingOption, MoveInput, MovingOption, PaymentEvent, PlanResult } from '../../domain/types';
import { addDays } from '../../domain/engine';
import { CashChart } from '../../components/CashChart';
import { DateField, Icon, Modal, MoneyField, Panel } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';
import { OptionEditor, type OptionDraft } from './OptionEditor';
import { PaymentEditor } from './PaymentEditor';
import { localToday, paymentTimingNote, putPayment, removePayment, validDate, validMoney, type PaymentOwner } from './inputHelpers';
import './YourMovePage.css';

type OptionKind = 'housing' | 'moving';
type Option = HousingOption | MovingOption;
type PaymentDraft = { owner: PaymentOwner; event: PaymentEvent; isNew: boolean; containerLabel: string };
type EditingOption = { kind: OptionKind; option?: Option };

/** Nurbol owns this page. The shared MoveInput contract stays unchanged. */
export function YourMovePage({ input, onChange, onStartOwn, source, onCompare, preview, errors }: {
  input: MoveInput; onChange: (input: MoveInput) => void; onStartOwn: () => void;
  source: 'example' | 'own' | 'saved'; onCompare: () => void; preview?: PlanResult; errors: string[];
}) {
  const [payment, setPayment] = useState<PaymentDraft | null>(null);
  const [editingOption, setEditingOption] = useState<EditingOption | null>(null);
  const [removingOption, setRemovingOption] = useState<{ kind: OptionKind; option: Option } | null>(null);
  const [startingOwn, setStartingOwn] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const mark = (field: string) => setTouched(old => ({ ...old, [field]: true }));
  const end = validDate(input.startDate) ? addDays(input.startDate, 59) : '';
  const eventCount = input.commonEvents.length + [...input.housingOptions, ...input.movingOptions].reduce((count, option) => count + option.events.length, 0);
  const canAddPayment = eventCount < 300;
  const compatible = input.housingOptions.some(h => input.movingOptions.some(m => validDate(m.moveDate) && m.moveDate >= h.availableFrom && m.moveDate <= input.latestMoveDate));
  const cashText = (amount: number) => validMoney(amount) ? money(amount) : '—';

  function addPayment(owner: PaymentOwner, containerLabel: string, kind: PaymentEvent['kind'] = 'expense', date = input.startDate) {
    if (!canAddPayment) { setNotice('This plan can contain up to 300 payments. Remove an entry before adding another.'); return; }
    setPayment({ owner, containerLabel, isNew: true, event: { id: crypto.randomUUID(), label: '', date: validDate(date) ? date : localToday(), amountCents: NaN, kind, confirmation: kind === 'deposit-refund' ? 'proposed' : 'confirmed' } });
  }

  function eventRow(event: PaymentEvent, owner: PaymentOwner, containerLabel: string) {
    const timing = paymentTimingNote(event, input.startDate);
    return <button key={event.id} className="event-row" onClick={() => setPayment({ event, owner, containerLabel, isNew: false })}>
      <span className={`event-icon ${event.kind === 'income' ? 'income' : ''}`}><Icon name={event.kind === 'income' ? 'wallet' : event.kind === 'deposit-refund' ? 'refresh' : 'calendar'}/></span>
      <span className="event-description"><strong>{event.label}</strong><small>{shortDate(event.actual?.date ?? event.date)} · {event.actual ? 'Actual recorded' : event.kind === 'income' ? 'Income' : event.kind === 'refundable-deposit' ? 'Refundable deposit' : event.kind === 'deposit-refund' ? 'Expected return' : 'Expense'}</small>{timing && <small className="move-timing-note">{timing}</small>}</span>
      <span className="event-amount">{money(event.actual?.amountCents ?? event.amountCents)}</span><Icon name="chevron" size={15}/>
    </button>;
  }

  function saveOption(draft: OptionDraft) {
    if (!editingOption) return;
    const { kind, option } = editingOption;
    const options = kind === 'housing' ? input.housingOptions : input.movingOptions;
    if (!option && options.length >= 3) { setNotice('You can compare up to three options of each type.'); setEditingOption(null); return; }
    const shared = { id: option?.id ?? crypto.randomUUID(), label: draft.label, confirmation: draft.confirmation, events: option?.events ?? [] };
    if (kind === 'housing') {
      const next: HousingOption = { ...shared, availableFrom: draft.date };
      onChange({ ...input, housingOptions: option ? input.housingOptions.map(h => h.id === option.id ? next : h) : [...input.housingOptions, next] });
    } else {
      const next: MovingOption = { ...shared, moveDate: draft.date };
      onChange({ ...input, movingOptions: option ? input.movingOptions.map(m => m.id === option.id ? next : m) : [...input.movingOptions, next] });
    }
    setEditingOption(null);
    setNotice(option ? 'Option updated. Payment deadlines are unchanged.' : 'Option added. Add its payments below, or a $0 payment if there is no cost.');
  }

  function optionCard(option: Option, kind: OptionKind, index: number) {
    const owner: PaymentOwner = { kind, id: option.id };
    const date = 'availableFrom' in option ? option.availableFrom : option.moveDate;
    const defaultPaymentDate = date < input.startDate ? input.startDate : date;
    return <details className="editor-details move-option-card" key={option.id} open={option.events.length === 0 ? true : undefined}>
      <summary><span className="option-letter">{kind === 'housing' ? String.fromCharCode(65 + index) : index + 1}</span><span className="option-summary"><strong>{option.label}</strong><small>{kind === 'housing' ? 'Available' : 'Moving'} {shortDate(date)} · {option.events.length} payment{option.events.length === 1 ? '' : 's'}</small></span><span className={`badge ${option.confirmation === 'confirmed' ? 'green' : 'amber'}`}>{option.confirmation === 'confirmed' ? 'Confirmed' : 'Unconfirmed'}</span></summary>
      <div className="option-body">
        <div className="move-option-toolbar"><button className="text-button" onClick={() => setEditingOption({ kind, option })}>Edit name & dates</button><button className="text-button negative" aria-label={`Remove ${option.label}`} onClick={() => setRemovingOption({ kind, option })}>Remove option</button></div>
        {!option.events.length && <p className="move-empty-payments">Add the payments for this option. A $0 entry explicitly confirms there is no cost.</p>}
        {option.events.map(event => eventRow(event, owner, option.label))}
        <div className="move-add-payment-actions"><button className="add-entry" disabled={!canAddPayment} onClick={() => addPayment(owner, option.label, 'expense', defaultPaymentDate)}><Icon name="plus" size={17}/>Add payment</button>{kind === 'housing' && <button className="add-entry" disabled={!canAddPayment} onClick={() => addPayment(owner, option.label, 'refundable-deposit', defaultPaymentDate)}><Icon name="plus" size={17}/>Add deposit</button>}</div>
      </div>
    </details>;
  }

  return <>
    <div className="page-heading"><div className="eyebrow-line"><span className="eyebrow">01 / YOUR MOVE</span><span className="example-badge">{source === 'example' ? 'Based on fictional example data' : source === 'saved' ? 'Your saved plan' : 'Your own move'}</span></div><h1>Your move, in numbers.</h1><p>Put your cash and commitments in one place. See what each moving date means for you.</p></div>
    <div className="move-start-bar"><div><strong>{source === 'example' ? 'Ready to plan your own move?' : 'Need a fresh start?'}</strong><p>{source === 'example' ? 'Start with a clean form, or explore and edit the example below.' : 'Create a new move without carrying over old payments or options.'}</p></div><button className="button secondary" onClick={() => setStartingOwn(true)}><Icon name="plus" size={17}/>Start my own move</button></div>
    {notice && <div className="workspace-message" role="status"><Icon name="info" size={18}/><span>{notice}</span><button className="icon-button" aria-label="Dismiss update" onClick={() => setNotice('')}><Icon name="close" size={17}/></button></div>}
    <div className="input-layout"><div className="panel-stack">
      <Panel title="Your starting point" number="01"><div className="field-grid">
        <MoneyField label="Available cash" value={input.openingCashCents} onChange={openingCashCents => onChange({ ...input, openingCashCents })} onBlur={() => mark('cash')} error={touched.cash && !validMoney(input.openingCashCents) ? 'Enter your available dollars, from $0 to $10,000,000.' : undefined} hint="Your balance before the payments below."/>
        <MoneyField label="Keep as a reserve" value={input.reserveCents} onChange={reserveCents => onChange({ ...input, reserveCents })} onBlur={() => mark('reserve')} error={touched.reserve && !validMoney(input.reserveCents) ? 'Enter a reserve of $0 or more, up to $10,000,000.' : undefined} hint="$0 means no extra buffer."/>
        <DateField label="Start planning from" value={input.startDate} onChange={startDate => onChange({ ...input, startDate })} onBlur={() => mark('start')} error={touched.start && !validDate(input.startDate) ? 'Choose a valid start date.' : undefined}/>
        <DateField label="Move no later than" value={input.latestMoveDate} onChange={latestMoveDate => onChange({ ...input, latestMoveDate })} onBlur={() => mark('latest')} error={touched.latest && (!validDate(input.latestMoveDate) || input.latestMoveDate < input.startDate) ? 'Choose a date on or after the start of your plan.' : undefined}/>
      </div><p className="move-window-note">{end ? `This forecast covers ${shortDate(input.startDate)} – ${shortDate(end)}. Include all bills and paydays in that period.` : 'Choose a start date to set the 60-day planning window.'}</p></Panel>
      <Panel title="Paydays & other payments" number="02" aside={<span className="count-tag">{input.commonEvents.length} {input.commonEvents.length === 1 ? 'entry' : 'entries'}</span>}><p className="panel-intro">Include old rent, paydays, bills and everyday spending shared by every option. New home and moving costs belong in the options below.</p>
        {input.commonEvents.length ? <div className="event-list">{input.commonEvents.map(event => eventRow(event, { kind: 'common' }, 'All moving plans'))}</div> : <div className="move-empty-list"><Icon name="calendar" size={23}/><p>No shared payments yet. Add your paydays and existing bills, or leave this empty if none apply.</p></div>}
        <div className="move-quick-add"><button className="add-entry" disabled={!canAddPayment} onClick={() => addPayment({ kind: 'common' }, 'All moving plans', 'income')}><Icon name="plus" size={17}/>Add payday</button><button className="add-entry" disabled={!canAddPayment} onClick={() => addPayment({ kind: 'common' }, 'All moving plans')}><Icon name="plus" size={17}/>Add bill</button><button className="add-entry" disabled={!canAddPayment} onClick={() => addPayment({ kind: 'common' }, 'All moving plans', 'deposit-refund')}><Icon name="plus" size={17}/>Track old deposit</button></div>
      </Panel>
      <Panel title="Your moving options" number="03"><p className="panel-intro">Add up to three housing arrangements and three ways to move. Only compatible combinations will be compared.</p>
        <div className="move-group-heading"><h3 className="option-group-heading"><Icon name="home" size={17}/>Housing arrangements</h3><span className="count-tag">{input.housingOptions.length} / 3</span></div>
        <div className="option-list">{input.housingOptions.map((option, index) => optionCard(option, 'housing', index))}</div>
        {!input.housingOptions.length && <p className="move-empty-options">Add the home you are considering and its payment terms. Different offers for the same home can be separate options.</p>}
        <button className="move-add-option" disabled={input.housingOptions.length >= 3} onClick={() => setEditingOption({ kind: 'housing' })}><Icon name="plus" size={17}/>{input.housingOptions.length >= 3 ? 'Three housing options added' : 'Add housing option'}</button>
        <div className="move-group-heading"><h3 className="option-group-heading"><Icon name="truck" size={17}/>Moving arrangements</h3><span className="count-tag">{input.movingOptions.length} / 3</span></div>
        <div className="option-list">{input.movingOptions.map((option, index) => optionCard(option, 'moving', index))}</div>
        {!input.movingOptions.length && <p className="move-empty-options">Add a moving company, rented van or another way to move. Enter the actual price, including $0 for a free move.</p>}
        <button className="move-add-option" disabled={input.movingOptions.length >= 3} onClick={() => setEditingOption({ kind: 'moving' })}><Icon name="plus" size={17}/>{input.movingOptions.length >= 3 ? 'Three moving options added' : 'Add moving option'}</button>
        <p className="move-inline-note"><Icon name="info" size={16}/>Changing an option’s date never moves its payment deadlines. Only use terms the landlord or mover actually offers.</p>
      </Panel>
      {errors.length > 0 && <div className="notice move-completion" aria-live="polite"><strong>Before you compare</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
      {!errors.length && !compatible && <div className="notice danger" role="alert"><strong>These dates do not fit together.</strong><p>Add a moving date on or after the home becomes available, and on or before your latest move date.</p></div>}
      {!canAddPayment && <p className="move-field-error">The 300-payment limit has been reached.</p>}
      <div className="form-actions"><span>{errors.length ? 'Complete the entries above to continue.' : 'Ready to see your options?'}</span><button className="button primary" disabled={errors.length > 0 || !compatible} onClick={onCompare}>Compare plans<Icon name="arrow" size={18}/></button></div>
    </div><aside className="input-aside">
      <section className="cash-overview"><div className="cash-overview-top"><span>Your starting cash</span><Icon name="wallet"/></div><div className="cash-amount">{cashText(input.openingCashCents)}</div><div className="cash-split"><div><span>Protected reserve</span><strong>{cashText(input.reserveCents)}</strong></div><div><span>Planning window</span><strong>60 days</strong></div></div><div className="cash-rule"/><p>See your balance on payment dates,<br/>before you commit to a move.</p></section>
      <section className="panel preview-panel"><div className="panel-heading"><h2>First option at a glance</h2><Icon name="chart" size={18}/></div>{preview ? <><span className="caption">LOWEST CASH BALANCE</span><div className={`preview-value ${preview.minBalanceCents < input.reserveCents ? 'negative' : ''}`}>{money(preview.minBalanceCents)}</div><span className="field-hint">On {shortDate(preview.minBalanceDate)}, based on your entries.</span>{preview.needsConfirmation && <span className="badge amber move-preview-status">Conditions still need confirmation</span>}<CashChart input={input} plan={preview} compact/></> : <div className="move-preview-empty"><Icon name="chart" size={27}/><p>Add your cash, one housing option and one moving option with their payments to see the forecast.</p></div>}</section>
      <div className="note-block"><Icon name="info"/><div><strong>A deposit is not available cash.</strong><p>Your old deposit stays out of the forecast until you record its actual return.</p></div></div><p className="scope-note">{source === 'example' ? 'The example uses fictional payments. Start your own move to remove them all. ' : ''}Include every payment in the 60-day window. Missing bills are not estimated automatically.</p>
    </aside></div>
    {payment && <PaymentEditor key={payment.event.id} {...payment} startDate={input.startDate} allowedKinds={payment.owner.kind === 'common' ? ['expense', 'income', 'refundable-deposit', 'deposit-refund'] : payment.owner.kind === 'housing' ? ['expense', 'refundable-deposit'] : ['expense']} onClose={() => setPayment(null)} onSave={event => { onChange(putPayment(input, payment.owner, event)); setPayment(null); setNotice('Payment updated in your draft. Save your chosen plan to keep changes after closing.'); }} onRemove={() => { onChange(removePayment(input, payment.owner, payment.event.id)); setPayment(null); setNotice('Payment removed. Your forecast has been updated.'); }}/>}
    {editingOption && <OptionEditor kind={editingOption.kind} isNew={!editingOption.option} startDate={input.startDate} latestMoveDate={input.latestMoveDate} initial={editingOption.option ? { label: editingOption.option.label, confirmation: editingOption.option.confirmation, date: 'availableFrom' in editingOption.option ? editingOption.option.availableFrom : editingOption.option.moveDate } : { label: '', confirmation: 'proposed', date: validDate(input.latestMoveDate) ? input.latestMoveDate : localToday() }} onClose={() => setEditingOption(null)} onSave={saveOption}/>}
    {removingOption && <Modal title={`Remove ${removingOption.option.label}?`} onClose={() => setRemovingOption(null)}><p className="modal-intro">This removes the option and its {removingOption.option.events.length} payment entries, including any recorded actual amounts. Plans using this option will no longer be available.</p><div className="modal-actions"><button className="button secondary" onClick={() => setRemovingOption(null)}>Keep option</button><button className="button move-danger-button" onClick={() => { onChange(removingOption.kind === 'housing' ? { ...input, housingOptions: input.housingOptions.filter(h => h.id !== removingOption.option.id) } : { ...input, movingOptions: input.movingOptions.filter(m => m.id !== removingOption.option.id) }); setRemovingOption(null); setNotice('Option removed. The remaining combinations have been recalculated.'); }}>Remove option</button></div></Modal>}
    {startingOwn && <Modal title="Start your own move?" onClose={() => setStartingOwn(false)}><p className="modal-intro">This clears the current entries and any MoveGap plan saved in this browser. You will start with no example payments or options. Today starts the new 60-day window; you can change it.</p><div className="modal-actions"><button className="button secondary" onClick={() => setStartingOwn(false)}>Keep current move</button><button className="button primary" onClick={() => { setStartingOwn(false); setTouched({}); setNotice(''); onStartOwn(); }}>Start with a clean form</button></div></Modal>}
  </>;
}
