import type Dexie from 'dexie';
import { db } from '../db/db';
import { CORE_TABLES, META_KEYS, type MetaRecord } from '../db/tables';
import { write } from '../db/write';
import type { BackupReminderDays } from '../settings/schema';

export const DAY_MS = 86_400_000;
/** "Remind me later" hides the banner for 24 hours (R9.4). */
export const REMINDER_SNOOZE_MS = DAY_MS;
/** Without any backup, the banner appears once the first record is older than 72 hours (R9.3). */
export const FIRST_DATA_GRACE_MS = 72 * 3_600_000;

export interface BackupReminderInput {
  /** The `core.backupReminderDays` setting (R9.1). */
  intervalDays: BackupReminderDays;
  now: number;
  /** `core_meta.lastBackupAt`. */
  lastBackupAt?: number;
  /** `core_meta.reminderSnoozeUntil`. */
  snoozeUntil?: number;
  /** `core_meta.lastDataChangeAt`: the last change to core or module data (not the key or meta, R9.2). */
  lastDataChangeAt?: number;
  /** `core_meta.firstDataAt`: when the first record was stored (R9.3). */
  firstDataAt?: number;
}

/**
 * Whether the Home_Dashboard shows the backup reminder banner. All times are epoch ms.
 * - Off, or a "Remind me later" snooze still running: never (R9.2, R9.3, R9.4).
 * - With a last backup time: more than `interval × 24 h` since it, and a data change after it (R9.2).
 * - Without one: the first record was stored more than 72 h ago (R9.3).
 */
export function shouldShowBackupReminder(input: BackupReminderInput): boolean {
  const { intervalDays, now, lastBackupAt, snoozeUntil, lastDataChangeAt, firstDataAt } = input;
  if (intervalDays === 'off') return false;
  if (snoozeUntil !== undefined && snoozeUntil > now) return false;
  if (lastBackupAt !== undefined) {
    return now - lastBackupAt > intervalDays * DAY_MS && lastDataChangeAt !== undefined && lastDataChangeAt > lastBackupAt;
  }
  return firstDataAt !== undefined && now - firstDataAt > FIRST_DATA_GRACE_MS;
}

/**
 * "Remind me later" (R9.4): stores `reminderSnoozeUntil = now + 24 h` in `core_meta`, so the banner stays
 * hidden across restarts until then. Not an Owner data change. A failed write rejects with `DbWriteError`.
 */
export async function snoozeReminder(now: number, database: Dexie = db): Promise<number> {
  const until = now + REMINDER_SNOOZE_MS;
  const record: MetaRecord<number> = { key: META_KEYS.reminderSnoozeUntil, value: until };
  await write([CORE_TABLES.meta], () => database.table<MetaRecord<number>, string>(CORE_TABLES.meta).put(record), database);
  return until;
}
