import { useRef, useState, type ChangeEvent } from 'react';
import { applyImport, BackupImportError } from '../../core/backup/apply';
import { checkBackupFile, type ImportPlan } from '../../core/backup/import';
import { IMPORT_MESSAGES } from '../../core/backup/messages';
import { toDbWriteError } from '../../core/db/errors';
import { BACKUP_REMINDER_INTERVALS, type BackupReminderDays } from '../../core/settings/schema';
import { useSetting } from '../../core/settings/useSetting';
import { Select } from '../../ui/form/Select';
import { Button } from '../../ui/primitives/Button';
import { CardFrame } from '../../ui/primitives/CardFrame';
import { toast } from '../../ui/toast/toastStore';
import { runExportWithToast } from '../HomeDashboard';
import { ImportSheet } from './ImportSheet';

const INTERVAL_OPTIONS = [
  ...BACKUP_REMINDER_INTERVALS.map((d) => ({ value: String(d), label: `Every ${d} days` })),
  { value: 'off', label: 'Off' },
];

/** Picks a file, checks it, asks for confirmation, applies it (Undo toast follows). Cancelling changes nothing. */
export async function importFromFile(file: File, setPlan: (plan: ImportPlan) => void): Promise<void> {
  const check = await checkBackupFile(file);
  if (!check.ok) toast.show({ message: check.message, kind: 'error', durationMs: 10_000 });
  else setPlan(check.plan);
}

export function BackupSection() {
  const [interval, commit] = useSetting<BackupReminderDays>('core.backupReminderDays');
  const [intervalError, setIntervalError] = useState<string | undefined>();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onInterval = async (value: string) => {
    try {
      const result = await commit(value === 'off' ? 'off' : Number(value));
      setIntervalError(result.ok ? undefined : result.error);
    } catch (error) {
      toast.show({ message: toDbWriteError(error).message, kind: 'error' });
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importFromFile(file, setPlan);
  };

  const confirm = async () => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const result = await applyImport(plan);
      setPlan(null);
      if (result.skipped.length > 0) toast.show({ message: `Imported. Skipped unknown modules: ${result.skipped.join(', ')}.` });
    } catch (error) {
      const reason = error instanceof BackupImportError ? error.reason : toDbWriteError(error).reason;
      setPlan(null);
      toast.show({ message: IMPORT_MESSAGES.applyFailed(reason), kind: 'error', durationMs: 10_000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardFrame aria-labelledby="settings-backup" className="flex flex-col gap-3">
      <h2 id="settings-backup" className="text-lg font-semibold">
        Backup
      </h2>
      <Select label="Remind me to back up" value={String(interval)} options={INTERVAL_OPTIONS} onChange={(v) => void onInterval(v)} error={intervalError} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void runExportWithToast()}>Export backup</Button>
        <Button variant="secondary" onClick={() => input.current?.click()}>
          Import backup
        </Button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={onPick} data-testid="import-input" />
      <ImportSheet plan={plan} busy={busy} onCancel={() => setPlan(null)} onConfirm={() => void confirm()} />
    </CardFrame>
  );
}
