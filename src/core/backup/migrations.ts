import type { ModuleBackup } from '../registry/types';
import { SUPPORTED_SCHEMA_VERSION } from './format';

/** Migrates a parsed Backup_File from Schema_Version `v` to `v + 1` (the key of `ENVELOPE_MIGRATIONS`). */
export type EnvelopeMigration = (file: Record<string, unknown>) => Record<string, unknown>;

/** Envelope migrations by source version. Schema_Version 1 is the first version, so there are none yet. */
export const ENVELOPE_MIGRATIONS: Readonly<Record<number, EnvelopeMigration>> = {};

/** A Backup_File (or one of its module entries) could not be migrated to the supported version (R7.13). */
export class BackupMigrationError extends Error {
  override readonly name = 'BackupMigrationError';
  constructor(
    /** The version the failed step started from. */
    readonly fromVersion: number,
    /** The module id for a module entry migration; absent for the envelope. */
    readonly moduleId?: string,
    options?: { cause?: unknown },
  ) {
    super(
      moduleId === undefined
        ? `Backup migration from Schema_Version ${fromVersion} failed`
        : `Migration of module ${moduleId} data from version ${fromVersion} failed`,
      options,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Migrates `file` (whose `schemaVersion` passed the envelope and support checks) one version at a time up to
 * `target`, in memory (R7.6). The input is copied first, so the caller's value is never modified. Each step's
 * result gets `schemaVersion = v + 1`. A missing step, a throwing step or a step that does not return an
 * object throws `BackupMigrationError`.
 */
export function migrateEnvelope(
  file: Record<string, unknown> & { schemaVersion: number },
  migrations: Readonly<Record<number, EnvelopeMigration>> = ENVELOPE_MIGRATIONS,
  target: number = SUPPORTED_SCHEMA_VERSION,
): Record<string, unknown> {
  if (file.schemaVersion >= target) return file;
  let current: Record<string, unknown> = structuredClone(file);
  for (let v = file.schemaVersion; v < target; v++) {
    const step = Object.hasOwn(migrations, v) ? migrations[v] : undefined;
    if (step === undefined) throw new BackupMigrationError(v);
    let next: unknown;
    try {
      next = step(current);
    } catch (error) {
      throw new BackupMigrationError(v, undefined, { cause: error });
    }
    if (!isRecord(next)) throw new BackupMigrationError(v);
    current = { ...next, schemaVersion: v + 1 };
  }
  return current;
}

/**
 * Migrates one module entry's `data` from `fromVersion` up to the module's current data version with the
 * module's own migrations (key `v` migrates v → v + 1). The input is copied first. A missing or throwing step
 * throws `BackupMigrationError` naming the module.
 */
export function migrateModuleEntry(
  moduleId: string,
  data: unknown,
  fromVersion: number,
  backup: Pick<ModuleBackup<unknown>, 'dataVersion' | 'migrations'>,
): unknown {
  if (fromVersion >= backup.dataVersion) return data;
  let current: unknown = structuredClone(data);
  for (let v = fromVersion; v < backup.dataVersion; v++) {
    const step = Object.hasOwn(backup.migrations, v) ? backup.migrations[v] : undefined;
    if (step === undefined) throw new BackupMigrationError(v, moduleId);
    try {
      current = step(current);
    } catch (error) {
      throw new BackupMigrationError(v, moduleId, { cause: error });
    }
  }
  return current;
}
