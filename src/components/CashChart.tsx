import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { MoveInput, PlanResult } from '../domain/types';
import { money, shortDate } from '../shared/format';
import { addDays } from '../domain/engine';
import './CashChart.css';

/** A view over engine rows: same-day events remain separate selectable points. */
export function CashChart({ plan, input, compact = false }: { plan: PlanResult; input: MoveInput; compact?: boolean }) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const minimumIndex = plan.timeline.findIndex(row => row.date === plan.minBalanceDate && row.balanceCents === plan.minBalanceCents) + 1;
  const [selection, setSelection] = useState({ planId: plan.id, index: minimumIndex });
  const selected = Math.min(selection.planId === plan.id ? selection.index : minimumIndex, plan.timeline.length);
  const select = (index: number) => setSelection({ planId: plan.id, index: Math.max(0, Math.min(plan.timeline.length, index)) });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(180, Math.round(element.getBoundingClientRect().width)));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const { startDate, openingCashCents: opening, reserveCents: reserve } = input;
  const points = [{ date: startDate, label: 'Starting cash', balance: opening, change: null as number | null, actual: false },
    ...plan.timeline.map(row => ({ date: row.date, label: row.label, balance: row.balanceCents, change: row.cashChangeCents, actual: row.isActual }))];
  const point = points[selected];
  const values = [opening, reserve, 0, ...plan.timeline.map(row => row.balanceCents)];
  const min = Math.min(...values); const max = Math.max(...values);
  const padding = Math.max(10000, (max - min) * .12);
  const low = min - padding; const high = max + padding;
  const height = compact ? 190 : 250;
  const left = Math.max(52, Math.max(money(min).length, money(max).length) * 7 + 10);
  const right = 14; const top = 20; const bottom = 32;
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom);
  const x = (date: string) => left + (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 / 59 * Math.max(30, width - left - right);
  let path = `M ${x(startDate)} ${y(opening)}`;
  for (const row of plan.timeline) path += ` H ${x(row.date)} V ${y(row.balanceCents)}`;
  path += ` H ${x(addDays(startDate, 59))}`;
  const ticks = [...new Set([min, 0, max])].sort((a, b) => a - b);
  // Closely spaced values share a tick, without dropping a cash-flow point.
  const visibleTicks = ticks.filter((value, index) => index === 0 || Math.abs(y(value) - y(ticks[index - 1])) >= 20);
  const dates = width < 420 ? [0, 59] : [0, 29, 59];
  function keydown(event: KeyboardEvent<SVGSVGElement>) {
    if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      select(event.key === 'Home' ? 0 : event.key === 'End' ? plan.timeline.length : selected + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1));
    }
  }
  function inspect(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) * width / rect.width;
    const py = (event.clientY - rect.top) * height / rect.height;
    let nearest = 0; let distance = Infinity;
    points.forEach((p, index) => { const delta = (x(p.date) - px) ** 2 + (y(p.balance) - py) ** 2; if (delta < distance) { distance = delta; nearest = index; } });
    select(nearest);
  }

  return <div className={`mg-cash-chart${compact ? ' mg-cash-chart--compact' : ''}`} ref={container}>
    <p id={`${id}-help`} className="mg-chart-help">Tap the line to inspect a payment, or focus the chart and use the arrow keys.</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} onKeyDown={keydown} onClick={inspect}>
      <title id={`${id}-title`}>{`Cash after each payment. Lowest balance ${money(plan.minBalanceCents)} on ${shortDate(plan.minBalanceDate)}. Reserve ${money(reserve)}.`}</title>
      <rect x={left} y={y(reserve)} width={Math.max(30, width - left - right)} height={height - bottom - y(reserve)} className="mg-chart-below"/>
      {visibleTicks.map(value => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className={value === 0 ? 'mg-chart-zero' : 'mg-chart-grid'}/><text x={left - 8} y={y(value) + 4} textAnchor="end" className="mg-chart-label">{money(value)}</text></g>)}
      <line x1={left} x2={width - right} y1={y(reserve)} y2={y(reserve)} className="mg-chart-reserve"/>
      <path d={path} className="mg-chart-line"/>
      <rect x={x(plan.minBalanceDate) - 5} y={y(plan.minBalanceCents) - 5} width={10} height={10} transform={`rotate(45 ${x(plan.minBalanceDate)} ${y(plan.minBalanceCents)})`} className="mg-chart-minimum"/>
      <circle cx={x(point.date)} cy={y(point.balance)} r={7} className="mg-chart-selected"/>
      {dates.map(day => <text key={day} x={x(addDays(startDate, day))} y={height - 8} textAnchor={day === 0 ? 'start' : day === 59 ? 'end' : 'middle'} className="mg-chart-label">{shortDate(addDays(startDate, day))}</text>)}
    </svg>
    <div className="mg-chart-legend"><span><i className="mg-chart-line-key"/>Available cash</span><span><i className="mg-chart-reserve-key"/>Reserve {money(reserve)}</span><span><i className="mg-chart-minimum-key"/>Lowest point</span></div>
    <div className="mg-chart-controls"><label htmlFor={`${id}-point`}>Inspect a payment</label><select id={`${id}-point`} value={selected} onChange={event => select(Number(event.target.value))}>{points.map((p, index) => <option key={index} value={index}>{shortDate(p.date)} · {p.label}{p.actual ? ' · Actual' : ''}</option>)}</select><div className="mg-chart-step"><button type="button" disabled={selected === 0} onClick={() => select(selected - 1)}>Previous</button><button type="button" disabled={selected === points.length - 1} onClick={() => select(selected + 1)}>Next</button></div></div>
    <div className="mg-chart-detail" aria-live="polite" aria-atomic="true"><strong>{shortDate(point.date)} · {point.label}{point.actual ? ' · Actual' : ''}</strong><p>{point.change !== null && <>{point.change < 0 ? 'Paid' : 'Received'} {money(Math.abs(point.change))} · </>}Cash left: <strong>{money(point.balance)}</strong></p><p>{point.balance < 0 ? 'Not enough cash for this payment.' : point.balance < reserve ? 'Below your chosen reserve.' : 'At or above your chosen reserve.'}{selected === minimumIndex ? ' This is the lowest point in the plan.' : ''}</p></div>
  </div>;
}
