import { useState } from 'react';
import type { WorkspaceController } from '../state/workspace';
import { CloudPlanPanel } from './cloud-plan/CloudPlanPanel';
import { Modal } from '../shared/ui';
import './WorkspaceStoragePanel.css';

export function WorkspaceStoragePanel({ workspace, showCloud = true }: { workspace: WorkspaceController; showCloud?: boolean }) {
  const [error, setError] = useState('');
  const [restoreKey, setRestoreKey] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown> | void) => {
    setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'The action could not finish. Your current draft is still available.'); }
  };
  const cloud = workspace.cloud;
  const local = workspace.draft;
  let copies: { key: string; savedAt: string }[] = [];
  try { copies = workspace.recoveryCopies(); } catch { /* Storage errors are also shown by the draft controller. */ }
  function downloadOriginal() {
    try {
      const url = URL.createObjectURL(new Blob([workspace.exportOriginal()], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'movegap-original-draft.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('The browser could not export the saved data.'); }
  }
  return <div className="workspace-storage">
    {(workspace.error || local.error || error) && <div className="notice danger" role="alert">{error || workspace.error || local.error}</div>}
    {local.status === 'conflict' && <section className="panel" aria-label="Draft conflict"><h2>Another tab changed this draft</h2><p>Your edits have not been overwritten. Choose a version to continue. Your current version will be kept as a recovery copy.</p><div className="storage-actions"><button className="button secondary" onClick={() => void run(() => workspace.resolveConflict('remote'))}>Use the other tab’s draft</button><button className="button secondary" onClick={() => void run(() => workspace.resolveConflict('local'))}>Keep my draft</button></div></section>}
    {(local.status === 'error' || workspace.error) && <div className="storage-actions"><button className="button secondary" onClick={() => void run(() => workspace.save())}>Retry local save</button><button className="button secondary" onClick={downloadOriginal}>Download original saved data</button></div>}
    {showCloud && cloud && !workspace.cloudChanged && <CloudPlanPanel state={cloud.panelState}
      onSave={() => run(() => cloud.save())} onOpenLink={link => run(() => workspace.openLink(link))}
      onCopyLink={() => run(() => cloud.copyLink())} onRevealLink={() => cloud.revealLink()}
      onLoadServerVersion={() => run(() => cloud.loadServerVersion())}
      onSaveLocalAsNew={() => run(() => cloud.saveLocalAsNew())}
      onDeleteCloudCopy={() => run(() => cloud.remove())} onRotateLink={() => run(() => cloud.rotateKey())}
      onRetry={() => run(() => cloud.retry())}/>}
    {copies.length > 0 && <details className="panel recovery-copies"><summary>Recover a previous local draft ({copies.length})</summary><p>These copies stay in this browser. Restoring keeps another copy of your current work and does not update the online plan.</p><ul>{copies.map(copy => <li key={copy.key}><span>{new Date(copy.savedAt).toLocaleString()}</span><button className="text-button" onClick={() => setRestoreKey(copy.key)}>Restore this draft</button></li>)}</ul></details>}
    {restoreKey && <Modal title="Restore this local draft?" onClose={() => setRestoreKey(null)}><p>Your current draft will be kept before replacement. No online plan will be changed.</p><div className="modal-actions"><button className="button secondary" onClick={() => setRestoreKey(null)}>Cancel</button><button className="button primary" onClick={() => { const key = restoreKey; setRestoreKey(null); void run(() => workspace.restoreRecovery(key)); }}>Keep current copy and restore</button></div></Modal>}
  </div>;
}
