import type { ReactNode } from 'react';
import { Icon } from '../shared/ui';

export type Page = 'move' | 'compare' | 'plan';
const steps: { id: Page; number: string; label: string; detail: string; icon: 'home' | 'chart' | 'calendar' }[] = [
  { id:'move', number:'01', label:'Your move', detail:'Cash, dates & options', icon:'home' },
  { id:'compare', number:'02', label:'Compare plans', detail:'Find a workable option', icon:'chart' },
  { id:'plan', number:'03', label:'Your plan', detail:'Keep track of payments', icon:'calendar' },
];
export function WorkspaceShell({ page, children, onReset, onHelp, saved }: { page: Page; children: ReactNode; onReset: () => void; onHelp: () => void; saved: boolean }) {
  return <div className="workspace">
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a href="#/move" className="brand" aria-label="MoveGap home"><img src="/favicon.svg" alt="" width="34" height="34"/>MoveGap<span className="brand-dot">.</span></a>
      <div className="workspace-label">Moving workspace</div>
      <nav className="step-nav" aria-label="Move planner pages">{steps.map(step => <a href={`#/${step.id}`} key={step.id} aria-current={page === step.id ? 'page' : undefined} className={page === step.id ? 'step-link active' : 'step-link'}><span className="step-icon"><Icon name={step.icon}/></span><span><strong>{step.label}</strong><small>{step.detail}</small></span><span className="step-number">{step.number}</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Icon name="lock"/><p>Your numbers stay<br/>in this browser.</p></div><button className="help-button" onClick={onHelp}><Icon name="info"/>How this works<Icon name="chevron" size={15}/></button><span className="sidebar-meta">USD · 60-day planning window</span></div>
    </aside>
    <div className="workspace-main"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span><strong>{steps.find(s => s.id === page)?.label}</strong></div><div className="topbar-actions"><span className="draft-state"><span className="status-dot"/>{saved ? 'Saved in this browser' : 'Draft workspace'}</span><button className="text-button" onClick={onReset}><Icon name="refresh" size={16}/>Reset example</button></div></header>
      <main id="main-content" tabIndex={-1} className="page-content" key={page}>{children}</main>
      <footer className="app-footer"><span>MoveGap · Plan before you commit.</span><span>Based on the amounts and dates you enter.</span></footer>
    </div>
  </div>;
}
