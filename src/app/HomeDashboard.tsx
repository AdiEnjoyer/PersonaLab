import { useLiveQuery } from 'dexie-react-hooks';
import { exportBackup } from '../core/backup/export';
import { shouldShowBackupReminder, snoozeReminder } from '../core/backup/reminder';
import { db } from '../core/db/db';
import { CORE_TABLES, META_KEYS, type MetaRecord } from '../core/db/tables';
import { deriveCards } from '../core/registry/derive';
import { MODULES } from '../core/registry/modules';
import type { ModuleDefinition } from '../core/registry/types';
import { useSetting } from '../core/settings/useSetting';
import type { BackupReminderDays } from '../core/settings/schema';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Button } from '../ui/primitives/Button';
import { CardFrame } from '../ui/primitives/CardFrame';
import { toast } from '../ui/toast/toastStore';

const REMINDER_KEYS = [META_KEYS.lastBackupAt, META_KEYS.reminderSnoozeUntil, META_KEYS.lastDataChangeAt, META_KEYS.firstDataAt] as const;

/** Reports an export outcome as a Toast. Shared by the banner and the Settings_Screen. */
export async function runExportWithToast(): Promise<void> {
  const outcome = await exportBackup();
  if (outcome.kind === 'failed') toast.show({ message: outcome.message, kind: 'error' });
  else if (outcome.kind !== 'dismissed') {
    toast.show({
      message: outcome.lastBackupRecorded ? 'Backup exported.' : 'Backup exported, but the backup time could not be saved.',
    });
  }
}

export function BackupReminderBanner() {
  const [intervalDays] = useSetting<BackupReminderDays>('core.backupReminderDays');
  const meta = useLiveQuery(async () => {
    const rows = await db.table<MetaRecord<number>, string>(CORE_TABLES.meta).bulkGet([...REMINDER_KEYS]);
    return Object.fromEntries(REMINDER_KEYS.map((k, i) => [k, rows[i]?.value]));
  }, []);
  if (meta === undefined) return null;
  const input = {
    intervalDays,
    now: Date.now(),
    ...(meta[META_KEYS.lastBackupAt] !== undefined ? { lastBackupAt: meta[META_KEYS.lastBackupAt] } : {}),
    ...(meta[META_KEYS.reminderSnoozeUntil] !== undefined ? { snoozeUntil: meta[META_KEYS.reminderSnoozeUntil] } : {}),
    ...(meta[META_KEYS.lastDataChangeAt] !== undefined ? { lastDataChangeAt: meta[META_KEYS.lastDataChangeAt] } : {}),
    ...(meta[META_KEYS.firstDataAt] !== undefined ? { firstDataAt: meta[META_KEYS.firstDataAt] } : {}),
  };
  if (!shouldShowBackupReminder(input)) return null;
  return (
    <CardFrame aria-label="Backup reminder" className="border-accent">
      <p className="font-medium">It is time to back up your data.</p>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => void runExportWithToast()}>Export now</Button>
        <Button
          variant="secondary"
          onClick={() => void snoozeReminder(Date.now()).catch((e: unknown) => toast.show({ message: String(e instanceof Error ? e.message : e), kind: 'error' }))}
        >
          Remind me later
        </Button>
      </div>
    </CardFrame>
  );
}

function CardFailed({ name }: { name: string }) {
  return (
    <CardFrame role="alert">
      <p className="text-muted">{name} failed to load</p>
    </CardFrame>
  );
}

/** The backup banner, then one card per module in registry order; a failing card does not affect the rest (R2.10). */
export function HomeDashboard({ modules = MODULES }: { modules?: readonly Pick<ModuleDefinition, 'id' | 'name' | 'DashboardCard'>[] }) {
  return (
    <div className="flex flex-col gap-4">
      <BackupReminderBanner />
      {deriveCards(modules).map(({ moduleId, name, DashboardCard }) => (
        <ErrorBoundary key={moduleId} fallback={<CardFailed name={name} />}>
          <DashboardCard />
        </ErrorBoundary>
      ))}
    </div>
  );
}
