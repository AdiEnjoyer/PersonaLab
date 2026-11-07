import type Dexie from 'dexie';
import { db } from '../db/db';
import { hasErrorNamed } from '../db/errorChain';
import { CORE_TABLES, META_KEYS, type MetaRecord } from '../db/tables';
import { write } from '../db/write';
import { PROFILE_ID, type Profile } from '../profile/schema';
import { MODULES } from '../registry/modules';
import type { SettingRecord } from '../settings/repo';
import { getSecret, SECRET_KEYS } from '../settings/secrets';
import { backupFileName } from './filename';
import { BACKUP_APP_VERSION, BACKUP_FORMAT, BACKUP_MIME_TYPE, CORE_SECTION, SUPPORTED_SCHEMA_VERSION, toExportedAt } from './format';
import { validateBackupValue } from './import';
import { EXPORT_MESSAGES } from './messages';
import type { BackupV1 } from './schema';
import { shareOrDownload, type ShareResult } from './share';
import type { BackupModule } from './types';

/** The part named when an export stops: core data, images, a module id, the Gemini key check or the file. */
export const EXPORT_PARTS = {
  core: CORE_SECTION,
  images: 'images',
  secret: 'Gemini key',
  file: 'backup file',
} as const;

/** An export stopped before any file was shared or downloaded (R6.10, R8.7). */
export class BackupExportError extends Error {
  override readonly name = 'BackupExportError';
  constructor(
    /** The failed part: `core data`, `images`, a module id, `Gemini key` or `backup file`. */
    readonly part: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface BuildBackupOptions {
  database?: Dexie;
  /** The App version written into the file; `BACKUP_APP_VERSION` by default. */
  appVersion?: string;
}

/** Code-unit order, the order IndexedDB uses for string keys. */
const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

async function readCoreData(database: Dexie): Promise<BackupV1['core']> {
  try {
    return await database.transaction('r', [CORE_TABLES.profile, CORE_TABLES.settings], async () => {
      const profile = await database.table<Profile, string>(CORE_TABLES.profile).get(PROFILE_ID);
      const settings = await database.table<SettingRecord, string>(CORE_TABLES.settings).toArray();
      return {
        profile: profile ?? null,
        settings: settings.map((s) => ({ key: s.key, value: s.value })).sort(byKey),
      };
    });
  } catch (error) {
    throw new BackupExportError(EXPORT_PARTS.core, EXPORT_MESSAGES.readFailed(EXPORT_PARTS.core), { cause: error });
  }
}

/**
 * Builds the Backup_File for an export at `now` (R6.1): the core Profile and settings (never a secret), then
 * one entry per module in registry order with the output of its `exportData()`, called exactly once each
 * (R2.4). The text is checked so it cannot contain the stored Gemini key (R6.3) and is validated with the
 * import checks (R8.7). Any failure throws `BackupExportError` naming the part (R2.9, R6.10). Reads only.
 */
export async function buildBackup(
  now: Date,
  modules: readonly BackupModule[] = MODULES,
  options: BuildBackupOptions = {},
): Promise<{ file: BackupV1; text: string }> {
  const database = options.database ?? db;
  const exportedAt = toExportedAt(now);
  const core = await readCoreData(database);

  const entries: BackupV1['modules'] = [];
  for (const mod of modules) {
    let data: unknown;
    try {
      data = await mod.exportData();
    } catch (error) {
      const part = hasErrorNamed(error, 'ImageExportError') ? EXPORT_PARTS.images : mod.id;
      throw new BackupExportError(part, EXPORT_MESSAGES.readFailed(part), { cause: error });
    }
    entries.push({ id: mod.id, dataVersion: mod.backup.dataVersion, data });
  }

  const file: BackupV1 = {
    format: BACKUP_FORMAT,
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    appVersion: options.appVersion ?? BACKUP_APP_VERSION,
    exportedAt,
    core,
    modules: entries,
  };

  let text: string;
  try {
    text = JSON.stringify(file);
  } catch (error) {
    throw new BackupExportError(EXPORT_PARTS.file, EXPORT_MESSAGES.invalidFile('the data could not be written as JSON.'), { cause: error });
  }

  let geminiKey: string | undefined;
  try {
    geminiKey = await getSecret(SECRET_KEYS.geminiKey, database);
  } catch (error) {
    throw new BackupExportError(EXPORT_PARTS.core, EXPORT_MESSAGES.readFailed(EXPORT_PARTS.core), { cause: error });
  }
  if (geminiKey !== undefined && geminiKey !== '' && text.includes(geminiKey)) {
    throw new BackupExportError(EXPORT_PARTS.secret, EXPORT_MESSAGES.containsSecret);
  }

  const check = validateBackupValue(JSON.parse(text), modules);
  if (!check.ok) throw new BackupExportError(check.section ?? EXPORT_PARTS.file, EXPORT_MESSAGES.invalidFile(check.message));

  return { file, text };
}

export type ExportOutcome =
  /** The file was shared or its download started; `lastBackupRecorded` is false when that write failed. */
  | { kind: 'shared' | 'downloaded'; exportedAt: string; lastBackupRecorded: boolean }
  /** The Owner dismissed the share sheet: no message, last backup time unchanged (R6.8). */
  | { kind: 'dismissed' }
  /** Nothing was shared or downloaded; `message` is the error Toast text naming `part` (R6.10, R8.7). */
  | { kind: 'failed'; part: string; message: string };

export interface ExportBackupOptions extends BuildBackupOptions {
  modules?: readonly BackupModule[];
  /** Clock for the export timestamp and file name. */
  now?: () => Date;
  /** Shares or downloads the file; `shareOrDownload` by default. */
  deliver?: (file: File) => Promise<ShareResult>;
}

/** Writes `core_meta.lastBackupAt` (epoch ms of the file's export timestamp). Not an Owner data change. */
async function recordLastBackup(exportedAt: string, database: Dexie): Promise<boolean> {
  try {
    const record: MetaRecord<number> = { key: META_KEYS.lastBackupAt, value: Date.parse(exportedAt) };
    await write([CORE_TABLES.meta], () => database.table<MetaRecord<number>, string>(CORE_TABLES.meta).put(record), database);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Export backup" (R6): builds the file, names it from the local export time (R6.4), shares or downloads it
 * (R6.5, R6.6, R6.9) and, when it was shared or its download started, records the export timestamp as the
 * last backup time (R6.7). A dismissed share sheet (R6.8) or a failure (R6.10, R8.7) writes nothing.
 */
export async function exportBackup(options: ExportBackupOptions = {}): Promise<ExportOutcome> {
  const database = options.database ?? db;
  const now = (options.now ?? (() => new Date()))();

  let built: { file: BackupV1; text: string };
  try {
    built = await buildBackup(now, options.modules ?? MODULES, options);
  } catch (error) {
    if (error instanceof BackupExportError) return { kind: 'failed', part: error.part, message: error.message };
    return { kind: 'failed', part: EXPORT_PARTS.file, message: EXPORT_MESSAGES.readFailed(EXPORT_PARTS.file) };
  }

  const file = new File([built.text], backupFileName(now), { type: BACKUP_MIME_TYPE });
  let result: ShareResult;
  try {
    result = await (options.deliver ?? shareOrDownload)(file);
  } catch {
    return { kind: 'failed', part: EXPORT_PARTS.file, message: EXPORT_MESSAGES.deliveryFailed };
  }
  if (result === 'dismissed') return { kind: 'dismissed' };

  const lastBackupRecorded = await recordLastBackup(built.file.exportedAt, database);
  return { kind: result, exportedAt: built.file.exportedAt, lastBackupRecorded };
}
