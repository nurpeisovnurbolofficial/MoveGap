import type { ReactNode } from 'react';
import { Icon } from '../shared/ui';
import './WorkspaceShell.css';

export type Page = 'overview' | 'move' | 'compare' | 'plan';
/** The menu reads as a path: start, then three numbered steps. */
const sections: { id: Page; label: string; step?: number }[] = [
  { id:'overview', label:'Start' }, { id:'move', label:'Your move', step:1 },
  { id:'compare', label:'Compare plans', step:2 }, { id:'plan', label:'Track payments', step:3 },
];

export function WorkspaceShell({ page, children, onReset, onHelp, onSave, saved, dirty, hasPlan, source }: {
  page: Page;
  children: ReactNode; onReset: () => void; onHelp: () => void; onSave: () => void;
  saved: boolean; dirty: boolean; hasPlan: boolean; source: 'example' | 'own' | 'saved';
}) {
  return <div className="move-workspace">
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus({ preventScroll: true }); window.scrollTo(0, 0); }}>Skip to content</a>
    <header className="workspace-header">
      <div className="workspace-header-inner">
        <a href="#/overview" className="brand" aria-label="MoveGap overview"><img src="/favicon.svg" alt="" width="32" height="32"/>MoveGap<span className="brand-dot">.</span></a>
        <span className="workspace-kind">{source === 'example' ? 'Example move' : 'My move'}</span>
        <div className="workspace-tools">
          <button className="icon-button" aria-label="How this works" onClick={onHelp}><Icon name="info"/></button>
          <button className="button secondary workspace-reset" aria-label="Reset example" onClick={onReset}><Icon name="refresh" size={16}/><span>Reset example</span></button>
          <button className="button primary workspace-save" disabled={!hasPlan} title={!hasPlan ? 'Choose a moving option to save your plan' : undefined} onClick={onSave}><Icon name="save" size={17}/>{saved ? 'Saved' : 'Save draft'}</button>
        </div>
      </div>
      <div className="workspace-nav-row">
        <nav className="workspace-sections" aria-label="Workspace sections">
          {sections.map(section => <a key={section.id} href={`#/${section.id}`} aria-current={page === section.id ? 'page' : undefined}>{section.step && <span className="workspace-step" aria-hidden="true">{section.step}</span>}{section.step && <span className="visually-hidden">Step {section.step}: </span>}{section.label}</a>)}
        </nav>
        <span className={`workspace-save-state${dirty ? ' unsaved' : ''}`}><span aria-hidden="true"/>{saved ? 'Saved in this browser' : dirty ? 'Unsaved changes' : 'Not saved yet'}</span>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="workspace-canvas" key={page}>{children}</main>
    <footer className="workspace-footer"><span>MoveGap · Plan before you commit.</span><span>Drafts stay in this browser. Save online only when you choose. Calculations use your entered payments. Not financial or legal advice.</span><button className="text-button" onClick={onHelp}>How this works</button></footer>
  </div>;
}
