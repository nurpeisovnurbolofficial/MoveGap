import type { MoveInput, PaymentEvent, PlanResult } from '../../domain/types';
import { CashChart } from '../../components/CashChart';
import { DateField, Icon, MoneyField, Panel } from '../../shared/ui';
import { money, shortDate } from '../../shared/format';

/** Nurbol owns this page. Keep shared contracts in domain/types.ts stable. */
export function YourMovePage({ input, onChange, onEditEvent, onCompare, preview, errors }: {
  input: MoveInput; onChange: (input: MoveInput) => void; onEditEvent: (event: PaymentEvent) => void;
  onCompare: () => void; preview?: PlanResult; errors: string[];
}) {
  const eventRow = (event: PaymentEvent) => <button key={event.id} className="event-row" onClick={() => onEditEvent(event)}>
    <span className={`event-icon ${event.kind === 'income' ? 'income' : ''}`}><Icon name={event.kind === 'income' ? 'wallet' : event.kind === 'deposit-refund' ? 'refresh' : 'calendar'}/></span>
    <span className="event-description"><strong>{event.label}</strong><small>{shortDate(event.actual?.date ?? event.date)}{event.kind === 'deposit-refund' && !event.actual ? ' · Expected, excluded from cash' : event.actual ? ' · Actual recorded' : ''}</small></span>
    <span className="event-amount">{money(event.actual?.amountCents ?? event.amountCents)}</span><Icon name="chevron" size={15}/>
  </button>;
  function addPayment() {
    const event: PaymentEvent = { id: crypto.randomUUID(), label: 'New payment', date: input.startDate, amountCents: 0, kind: 'expense', confirmation: 'confirmed' };
    onChange({ ...input, commonEvents: [...input.commonEvents, event] }); onEditEvent(event);
  }
  return <>
    <div className="page-heading"><div className="eyebrow-line"><span className="eyebrow">01 / YOUR MOVE</span><span className="example-badge">Fictional example loaded</span></div><h1>Your move, in numbers.</h1><p>Put your cash and commitments in one place. See what each moving date means for you.</p></div>
    <div className="input-layout"><div className="panel-stack">
      <Panel title="Your starting point" number="01"><div className="field-grid"><MoneyField label="Available cash" value={input.openingCashCents} onChange={openingCashCents => onChange({ ...input, openingCashCents })} hint="Your balance before the payments below."/><MoneyField label="Keep as a reserve" value={input.reserveCents} onChange={reserveCents => onChange({ ...input, reserveCents })} hint="The amount you want to leave untouched."/><DateField label="Start planning from" value={input.startDate} onChange={startDate => onChange({ ...input, startDate })}/><DateField label="Move no later than" value={input.latestMoveDate} onChange={latestMoveDate => onChange({ ...input, latestMoveDate })}/></div></Panel>
      <Panel title="Paydays & other payments" number="02" aside={<span className="count-tag">{input.commonEvents.length} entries</span>}><p className="panel-intro">Include the bills you will pay over the next 60 days. Select an entry to edit it.</p><div className="event-list">{input.commonEvents.map(eventRow)}</div><button className="add-entry" onClick={addPayment}><Icon name="plus" size={17}/>Add a payment or payday</button></Panel>
      <Panel title="Your moving options" number="03"><p className="panel-intro">Compare agreed options. Changing a moving date does not automatically change payment deadlines.</p>
        <h3 className="option-group-heading"><Icon name="home" size={17}/>Housing arrangements</h3>
        <div className="option-list">{input.housingOptions.map((option, index) => <details className="editor-details" key={option.id}><summary><span className="option-letter">{String.fromCharCode(65 + index)}</span><span className="option-summary"><strong>{option.label}</strong><small>Available {shortDate(option.availableFrom)}</small></span><span className={`badge ${option.confirmation === 'confirmed' ? 'green' : 'amber'}`}>{option.confirmation}</span></summary><div className="option-body"><DateField label={`Housing ${index + 1} available from`} value={option.availableFrom} onChange={availableFrom => onChange({ ...input, housingOptions: input.housingOptions.map(h => h.id === option.id ? { ...h, availableFrom } : h) })}/><label className="check-field"><input type="checkbox" checked={option.confirmation === 'confirmed'} onChange={e => onChange({ ...input, housingOptions: input.housingOptions.map(h => h.id === option.id ? { ...h, confirmation: e.target.checked ? 'confirmed' : 'proposed' } : h) })}/>These dates and terms are confirmed</label>{option.events.map(eventRow)}</div></details>)}</div>
        <h3 className="option-group-heading"><Icon name="truck" size={17}/>Moving arrangements</h3>
        <div className="option-list">{input.movingOptions.map((option, index) => <details className="editor-details" key={option.id}><summary><span className="option-letter">{index + 1}</span><span className="option-summary"><strong>{option.label}</strong><small>Move on {shortDate(option.moveDate)}</small></span><Icon name="chevron" size={15}/></summary><div className="option-body"><DateField label={`Moving option ${index + 1} date`} value={option.moveDate} onChange={moveDate => onChange({ ...input, movingOptions: input.movingOptions.map(m => m.id === option.id ? { ...m, moveDate } : m) })}/><label className="check-field"><input type="checkbox" checked={option.confirmation === 'confirmed'} onChange={e => onChange({ ...input, movingOptions: input.movingOptions.map(m => m.id === option.id ? { ...m, confirmation: e.target.checked ? 'confirmed' : 'proposed' } : m) })}/>This arrangement is confirmed</label>{option.events.map(eventRow)}</div></details>)}</div>
      </Panel>
      {errors.length > 0 && <div className="notice danger" role="alert"><strong>Check your entries</strong>{errors.map(error => <p key={error}>{error}</p>)}</div>}
      <div className="form-actions"><span>Ready to see your options?</span><button className="button primary" disabled={errors.length > 0} onClick={onCompare}>Compare plans<Icon name="arrow" size={18}/></button></div>
    </div><aside className="input-aside">
      <section className="cash-overview"><div className="cash-overview-top"><span>Your starting cash</span><Icon name="wallet"/></div><div className="cash-amount">{money(input.openingCashCents)}</div><div className="cash-split"><div><span>Protected reserve</span><strong>{money(input.reserveCents)}</strong></div><div><span>Planning window</span><strong>60 days</strong></div></div><div className="cash-rule"/><p>It is not just how much you spend.<br/>It is when the money leaves.</p></section>
      <section className="panel preview-panel"><div className="panel-heading"><h2>First option at a glance</h2><Icon name="chart" size={18}/></div>{preview ? <><span className="caption">LOWEST CASH BALANCE</span><div className={`preview-value ${preview.minBalanceCents < input.reserveCents ? 'negative' : ''}`}>{money(preview.minBalanceCents)}</div><span className="field-hint">On {shortDate(preview.minBalanceDate)}, based on your entries.</span><CashChart input={input} plan={preview} compact/></> : <p className="muted">Complete valid dates and amounts to see a preview.</p>}</section>
      <div className="note-block"><Icon name="info"/><div><strong>A deposit is not available cash.</strong><p>Your old deposit stays out of the forecast until you record its actual return.</p></div></div><p className="scope-note">The example has a short list of fictional payments. Add all your own bills for a complete 60-day picture.</p>
    </aside></div>
  </>;
}
