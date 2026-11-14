import { useId } from 'react';
import type { MoveInput, PlanResult } from '../domain/types';
import { money, shortDate } from '../shared/format';
import { addDays } from '../domain/engine';

export function CashChart({ plan, input, compact = false }: { plan: PlanResult; input: MoveInput; compact?: boolean }) {
  const { startDate, openingCashCents: openingCash, reserveCents: reserve } = input;
  const id = useId(); const width = 760; const height = compact ? 190 : 260;
  const left = 65; const right = 18; const top = 18; const bottom = 34;
  const values = [openingCash, reserve, 0, ...plan.timeline.map(e => e.balanceCents)];
  const low = Math.min(...values, 0) - 25000; const high = Math.max(...values, 100000) + 35000;
  const y = (v: number) => top + (high - v) / (high - low) * (height - top - bottom);
  const x = (date: string) => left + (Date.parse(date) - Date.parse(startDate)) / 86400000 / 59 * (width - left - right);
  let path = `M ${left} ${y(openingCash)}`;
  for (const point of plan.timeline) path += ` H ${x(point.date)} V ${y(point.balanceCents)}`;
  path += ` H ${width-right}`;
  const ticks = [...new Set([Math.ceil(high / 100000) * 100000 - 100000, Math.round(high / 2 / 100000) * 100000, 0, ...(plan.minBalanceCents < 0 ? [-100000] : [])])];
  return <div className={`cash-chart ${compact ? 'compact' : ''}`}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id}><title id={id}>Cash after each payment. Lowest balance {money(plan.minBalanceCents)} on {shortDate(plan.minBalanceDate)}. Reserve {money(reserve)}.</title>
    <rect x={left} y={y(reserve)} width={width-left-right} height={height-bottom-y(reserve)} fill="currentColor" className="chart-danger-zone"/>
    {ticks.filter(t=>t>=low && t<=high).map(t=><g key={t}><line x1={left} x2={width-right} y1={y(t)} y2={y(t)} className="chart-grid"/><text x={left-12} y={y(t)+4} textAnchor="end" className="chart-label">{money(t)}</text></g>)}
    <line x1={left} x2={width-right} y1={y(reserve)} y2={y(reserve)} className="chart-reserve"/>
    <path d={path} className="chart-line"/>
    <circle cx={x(plan.minBalanceDate)} cy={y(plan.minBalanceCents)} r="5" className={plan.meetsReserve ? 'chart-point good' : 'chart-point'}/>
    {[0,19,39,59].map(day=><text key={day} x={x(addDays(startDate,day))} y={height-8} textAnchor={day===0?'start':day===59?'end':'middle'} className="chart-label">{shortDate(addDays(startDate,day))}</text>)}
  </svg><div className="chart-legend"><span><i className="legend-line"/>Available cash</span><span><i className="legend-dash"/>Your {money(reserve)} reserve</span></div></div>;
}
