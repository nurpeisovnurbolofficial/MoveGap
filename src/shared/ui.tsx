import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

type IconName = 'arrow' | 'back' | 'wallet' | 'home' | 'chart' | 'calendar' | 'check' | 'lock' | 'plus' | 'close' | 'info' | 'truck' | 'refresh' | 'save' | 'chevron';
const paths: Record<IconName, ReactNode> = {
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  wallet: <><path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M20 11h-6v6h6m-3-3h.01"/></>,
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9"/><path d="M9 21v-8h6v8"/></>,
  chart: <><path d="M4 3v17h17"/><path d="m7 14 4-4 4 3 5-7"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/></>,
  truck: <><path d="M3 5h12v12H3zM15 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  refresh: <><path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5"/></>,
  save: <><path d="M4 3h13l4 4v14H3V3z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function MoneyField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><div className="money-input"><span aria-hidden="true">$</span><input id={id} type="number" inputMode="decimal" min="0" max="10000000" step="0.01" value={Number.isFinite(value) ? value / 100 : ''} onChange={e => onChange(e.target.value === '' ? NaN : Math.round(Number(e.target.value) * 100))} aria-describedby={hint ? `${id}-hint` : undefined}/></div>{hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}</div>;
}
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type="date" value={value} onChange={e => onChange(e.target.value)}/></div>;
}
export function Panel({ title, number, children, aside }: { title: string; number?: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{number && <span className="section-number">{number}</span>}{title}</h2>{aside}</div>{children}</section>;
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog=ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby={id} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-top"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
