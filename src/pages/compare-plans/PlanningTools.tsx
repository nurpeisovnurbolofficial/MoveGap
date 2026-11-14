import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { CalendarTooltip } from './CalendarTooltip';
import type { ComparisonResult, MoveInput, PlanResult } from '../../domain/types';
import { money, shortDate } from '../../shared/format';
import { addDays } from '../../domain/engine';
import { calendarDays, delayableIncome, paymentRequest } from './explorationData';
import { isEligible, unconfirmedItems } from './planInsights';
import './PlanningTools.css';

const outcome = (plan: PlanResult) => plan.needsConfirmation ? (plan.meetsReserve ? 'Needs confirmation' : 'Does not fit · needs confirmation')
  : plan.meetsReserve ? 'Keeps your reserve' : plan.firstBelowZeroDate ? 'Not enough cash' : 'Uses your reserve';

export function ScenarioControls({ input, original, current, eventId, days, active, onEvent, onDays, onActive }: {
  input: MoveInput; original: ComparisonResult; current: ComparisonResult; eventId: string; days: number; active: boolean;
  onEvent: (id: string) => void; onDays: (days: number) => void; onActive: (active: boolean) => void;
}) {
  const incomes = delayableIncome(input, original.horizonEnd);
  const selected = incomes.find(event => event.id === eventId);
  const before = original.plans.filter(isEligible).length;
  const after = current.plans.filter(isEligible).length;
  return <section className={`compare-scenario ${active ? 'is-active' : ''}`} aria-labelledby="scenario-title">
    <div><h2 id="scenario-title">What if your paycheck arrives late?</h2><p>Test a delayed income payment. Your original dates and saved plan stay unchanged.</p></div>
    {incomes.length ? <>
      <div className="scenario-fields"><label htmlFor="scenario-income">Income to test<select id="scenario-income" value={eventId} onChange={event => onEvent(event.target.value)}>{incomes.map(income => <option key={income.id} value={income.id}>{income.label} · {shortDate(income.date)} · {money(income.amountCents)}</option>)}</select></label>
        <label htmlFor="scenario-delay">Delay by<select id="scenario-delay" value={days} onChange={event => onDays(Number(event.target.value))}>{[1, 2, 3, 7].map(day => <option key={day} value={day}>{day} {day === 1 ? 'day' : 'days'}</option>)}</select></label>
        <label className="scenario-toggle"><input type="checkbox" checked={active} onChange={event => onActive(event.target.checked)}/>Test this delay</label>
      </div>
      {active && selected && <div className="scenario-result"><div role="status"><strong>What-if scenario · {selected.label} arrives {shortDate(addDays(selected.date, days))}, instead of {shortDate(selected.date)}.</strong><p>Confirmed plans that keep your reserve: {before} originally → {after} with this delay. All results below show this scenario. Return to original dates before choosing a plan.</p></div>
        <details className="scenario-changes"><summary>See how each plan changes</summary><ul>{current.plans.map((plan, index) => {
          const baseline = original.plans.find(p => p.id === plan.id);
          return baseline && <li key={plan.id}><strong>Plan {index + 1} · Move {shortDate(plan.moveDate)}</strong><span>Originally: {outcome(baseline)} · lowest cash {money(baseline.minBalanceCents)}</span><span>With delay: {outcome(plan)} · lowest cash {money(plan.minBalanceCents)}</span></li>;
        })}</ul></details><button className="button secondary" onClick={() => onActive(false)}>Return to original dates</button></div>}
    </> : <p>No future confirmed income to delay. Add it in Move details first. Income already received is not changed.</p>}
  </section>;
}

const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const month = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export function CashCalendar({ input, plan }: { input: MoveInput; plan: PlanResult }) {
  const days = calendarDays(input, plan);
  const [selected, setSelected] = useState(() => Math.max(0, days.findIndex(day => day.date === plan.minBalanceDate)));
  const [focusIndex, setFocusIndex] = useState(selected);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const pointerType = useRef('');
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const keyboard = () => { pointerType.current = 'keyboard'; };
    window.addEventListener('keydown', keyboard, true);
    return () => window.removeEventListener('keydown', keyboard, true);
  }, []);
  const index = Math.min(selected, days.length - 1);
  const day = days[index];
  const offset = (new Date(`${input.startDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  const columns = Math.ceil((offset + days.length) / 7);
  const high = Math.max(1, ...days.map(d => d.low));
  const shade = (value: number) => value < 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(value / high * 4)));
  const status = day.low < 0 ? `Short by ${money(-day.low)}` : day.low < input.reserveCents ? 'Below your reserve' : 'Keeps your reserve';
  function navigate(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') setPreviewIndex(null);
    let target = current;
    switch (event.key) {
      case 'ArrowUp': target--; break;
      case 'ArrowDown': target++; break;
      case 'ArrowLeft': target -= 7; break;
      case 'ArrowRight': target += 7; break;
      case 'Home': target = event.ctrlKey ? 0 : current - (current + offset) % 7; break;
      case 'End': target = event.ctrlKey ? 59 : current + 6 - (current + offset) % 7; break;
      default: return;
    }
    event.preventDefault(); target = Math.max(0, Math.min(59, target));
    setFocusIndex(target); buttons.current[target]?.focus({ preventScroll: true });
    buttons.current[target]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return <section className="cash-calendar" aria-labelledby="cash-calendar-title">
    <div className="cash-calendar-heading"><div><h3 id="cash-calendar-title">Your 60-day cash calendar</h3><p>One square is one day. Yellow shows the lowest cash that day. A red outline and slash mark days when a payment cannot be covered.</p></div><dl><div><dt>Lowest cash</dt><dd>{money(plan.minBalanceCents)}</dd></div><div><dt>Days with a cash shortfall</dt><dd>{days.filter(d => d.low < 0).length}</dd></div></dl></div>
    <div className="calendar-scroll"><div className="calendar-grid" role="group" aria-label="Daily cash. Up and down move one day; left and right move one week. Enter selects a day." style={{ '--calendar-weeks': columns } as CSSProperties}>
      {Array.from({ length: columns }, (_, col) => { const date = days[Math.max(0, col * 7 - offset)]?.date; const prior = days[Math.max(0, (col - 1) * 7 - offset)]?.date; return date && (col === 0 || date.slice(0, 7) !== prior?.slice(0, 7)) ? <span className="calendar-month" key={`month-${col}`} style={{ gridColumn: `${col + 2} / span ${Math.min(2, columns - col)}`, gridRow: 1 }}>{month(date)}</span> : null; })}
      {weekday.map((label, row) => <span className="calendar-weekday" aria-hidden="true" key={label} style={{ gridRow: row + 2, gridColumn: 1 }}>{label}</span>)}
      {days.map((item, i) => <button key={item.date} ref={node => { buttons.current[i] = node; }} className={`calendar-day shade-${shade(item.low)}${item.low < 0 ? ' has-shortfall' : ''}`} style={{ gridRow: (i + offset) % 7 + 2, gridColumn: Math.floor((i + offset) / 7) + 2 }} tabIndex={i === focusIndex ? 0 : -1} aria-pressed={i === index} aria-controls="calendar-day-detail" aria-label={`${shortDate(item.date)}: lowest cash ${money(item.low)}, ${item.low < 0 ? `short by ${money(-item.low)}` : item.low < input.reserveCents ? 'below reserve' : 'keeps reserve'}. ${item.rows.length} events.`}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setPreviewIndex(i); }}
        onPointerLeave={() => setPreviewIndex(null)}
        onPointerDown={event => { pointerType.current = event.pointerType; setPreviewIndex(null); }}
        onFocus={event => { setFocusIndex(i); if (pointerType.current !== 'touch' && pointerType.current !== 'mouse' && event.currentTarget.matches(':focus-visible')) setPreviewIndex(i); }}
        onBlur={() => setPreviewIndex(null)}
        onClick={() => { setPreviewIndex(null); setFocusIndex(i); setSelected(i); }} onKeyDown={event => navigate(event, i)}/>)}
    </div></div>
    <div className="calendar-legend"><span><i className="calendar-shortfall-key"/>Cash shortfall</span><span>Less cash <i className="shade-1"/><i className="shade-2"/><i className="shade-3"/><i className="shade-4"/> More cash</span></div>
    <p className="calendar-keyboard-hint">Hover or focus to preview. Click, tap, or press Enter or Space for details. Use arrow keys to move through the calendar.</p>
    {previewIndex !== null && buttons.current[previewIndex] && <CalendarTooltip key={previewIndex} anchor={buttons.current[previewIndex]!} text={`${shortDate(days[previewIndex].date)} · ${days[previewIndex].low < 0 ? `Short by ${money(-days[previewIndex].low)}` : `Balance ${money(days[previewIndex].low)}`}`}/>}
    <div id="calendar-day-detail" className="calendar-day-detail" aria-live="polite" aria-atomic="true"><h4>{shortDate(day.date)} · {status}</h4><p>Lowest cash: <strong>{money(day.low)}</strong> · End of day: <strong>{money(day.closing)}</strong></p>
      {day.rows.length ? <ul>{day.rows.map(row => <li key={row.eventId}><span>{row.label}{row.isActual ? ' · Actual' : ''}</span><span>{row.cashChangeCents < 0 ? '−' : '+'}{money(row.effectiveAmountCents)}<small>{money(row.balanceCents)} left</small></span></li>)}</ul> : <p>No payments or income entered for this day. Cash carries over from the previous day.</p>}
      {day.low !== day.closing && <p>A later payment or income changed the balance. The square shows the lowest point, not just the end of the day.</p>}
    </div>
  </section>;
}

export function PlanRecovery({ input, plan, number, onBack }: { input: MoveInput; plan: PlanResult; number: number; onBack: () => void }) {
  const request = paymentRequest(input, plan);
  const [copied, setCopied] = useState('');
  const draft = useRef<HTMLTextAreaElement>(null);
  if (plan.meetsReserve && !plan.needsConfirmation) return null;
  const message = request ? `Hi, I’m planning my move and would like to ask whether the ${request.event.label} payment of ${money(request.event.amountCents)}, currently due ${shortDate(request.event.date)}, could be paid on ${shortDate(request.toDate)} instead. My ${request.nextIncome.label} is expected on ${shortDate(request.nextIncome.date)}. Would that be possible, and would any fees or other terms change? Please confirm the terms in writing. Thank you.` : '';
  async function copy() {
    try { await navigator.clipboard.writeText(draft.current?.value ?? message); setCopied('Draft copied.'); }
    catch { setCopied('Copy wasn’t available. Select the draft text and copy it manually.'); draft.current?.focus(); draft.current?.select(); }
  }
  return <section className="compare-recovery" aria-labelledby="recovery-title"><h3 id="recovery-title">What would make Plan {number} work?</h3>
    {plan.gapToReserveCents > 0 && <p>You would need <strong>{money(plan.gapToReserveCents)} more available cash</strong> to make every entered payment and leave your reserve untouched.{plan.gapToZeroCents > 0 && <> Of that, {money(plan.gapToZeroCents)} is needed just to cover payments.</>}</p>}
    {plan.needsConfirmation && <p><strong>Confirm the terms first:</strong> {unconfirmedItems(plan, input).join(', ') || 'the proposed housing, moving or payment terms'}. Having enough cash does not confirm an agreement.</p>}
    {request ? <details><summary>Could a different payment date help?</summary><p>We tested moving <strong>{request.event.label} ({money(request.event.amountCents)})</strong> from {shortDate(request.event.date)} to {shortDate(request.toDate)}, the day after {request.nextIncome.label}. No other dates or amounts changed.</p><p>In that test, the lowest cash would be <strong>{money(request.after.minBalanceCents)}</strong>. {request.after.meetsReserve ? 'That would keep your reserve if the changed terms are agreed.' : <>You would still need {money(request.after.gapToReserveCents)} more to keep your reserve.</>}</p><p>This is a request you could discuss, not an agreed deadline. Availability, fees and other terms may change. Nothing has been saved or sent.</p>
      <label htmlFor="landlord-draft">Editable message draft</label><textarea id="landlord-draft" key={message} ref={draft} defaultValue={message} rows={7} onChange={() => setCopied('')}/><button className="button secondary" onClick={copy}>Copy draft</button><p role="status">{copied}</p>
    </details> : !plan.meetsReserve && <p>No single housing-payment change we tested improves this plan. Review your cash and agreed dates in Move details; we have not assumed any new income, discount or refund.</p>}
    <button className="button secondary" onClick={onBack}>Edit your move</button>
  </section>;
}
