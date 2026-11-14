import { WorkspaceContext } from '../../state/WorkspaceContext';
import { useContext, useState } from 'react';
import type { MoveInput } from '../../domain/types';
import { Icon, Panel } from '../../shared/ui';
import { createPlanBackup, MAX_BACKUP_BYTES, parsePlanBackup, restorePlanBackup, type PlanBackupFile } from '../../state/backup';
import { STORAGE_KEY } from '../../state/storage';
import './PlanBackup.css';

export function PlanBackup({ input, selectedId }: { input: MoveInput; selectedId: string | null }) {
  const workspace = useContext(WorkspaceContext);
  const [preview, setPreview] = useState<{ file: PlanBackupFile; baseline: string | null; token?: string } | null>(null);
  const [message, setMessage] = useState('');

  function download() {
    try {
      const blob = new Blob([createPlanBackup(input, selectedId)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `movegap-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Backup downloaded. Keep this file in a private place.');
    } catch { setMessage('This move cannot be exported until its entries are valid.'); }
  }

  async function inspect(file: File | undefined) {
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { setMessage('This backup file is too large.'); return; }
    try {
      const parsed = parsePlanBackup(await file.text());
      setPreview({ file: parsed, baseline: localStorage.getItem(STORAGE_KEY), token: workspace ? JSON.stringify(workspace.content) : undefined });
      setMessage('Review the details below before replacing your current browser data.');
    } catch { setMessage('This file is invalid or could not be read. Your current data was not changed.'); }
  }

  async function restore() {
    if (!preview) return;
    try {
      if (workspace) {
        if (preview.token !== JSON.stringify(workspace.content)) throw new Error('Your draft changed. Choose the backup again before replacing it.');
        await workspace.replaceDocument({ schemaVersion: 1, input: preview.file.snapshot.input, selectedId: preview.file.snapshot.selectedId });
        setPreview(null); setMessage('Backup restored. The previous draft is available in local recovery.');
        return;
      }
      const current = parsePlanBackup(createPlanBackup(input, selectedId)).snapshot;
      restorePlanBackup(preview.file, localStorage, preview.baseline, current);
      location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not restore this backup. Your current plan was not replaced.');
      setPreview(null);
    }
  }

  return <Panel title="Your data backup">
    <p className="panel-intro">Download a JSON copy of your entered move, recorded payments and selected plan. Restore it in another browser when needed. This is a manual transfer, not sync.</p>
    <div className="backup-actions">
      <button type="button" className="button secondary" onClick={download}><Icon name="save" size={16}/>Download backup</button>
      <label className="button secondary backup-file">Choose backup to restore<input type="file" accept=".json,application/json" onChange={event => void inspect(event.target.files?.[0])}/></label>
    </div>
    <p className="scope-note">The file contains personal financial details. Keep it private and do not commit it to GitHub.</p>
    {message && <p className="backup-message" role="status">{message}</p>}
    {preview && <div className="backup-preview">
      <strong>Ready to restore</strong>
      <p>{preview.file.snapshot.input.housingOptions.length} housing options · {preview.file.snapshot.input.movingOptions.length} moving options · {preview.file.snapshot.input.commonEvents.length + preview.file.snapshot.input.housingOptions.reduce((n, item) => n + item.events.length, 0) + preview.file.snapshot.input.movingOptions.reduce((n, item) => n + item.events.length, 0)} payments</p>
      <p>Selected plan: {preview.file.snapshot.selectedId ?? 'none'}</p>
      <p>Your current browser plan will be preserved before replacement.</p>
      <div className="backup-actions"><button type="button" className="button secondary" onClick={() => setPreview(null)}>Cancel</button><button type="button" className="button primary" onClick={() => void restore()}>Replace and restore</button></div>
    </div>}
  </Panel>;
}
