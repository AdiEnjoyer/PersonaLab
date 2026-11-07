import type Dexie from 'dexie';
import type { IndexableTypeArrayReadonly } from 'dexie';
import { db } from '../db/db';
import { toDbWriteError } from '../db/errors';
import { stripUndefined } from '../db/strip';
import { CORE_TABLES, moduleTableName } from '../db/tables';
import { write } from '../db/write';
import { MODULES } from '../registry/modules';
import { captureSnapshot, type TableSnapshot } from '../undo/recordDiff';
import { undoService as appUndoService, type UndoService } from '../undo/undoService';
import type { ImportPlan } from './import';
import { IMPORT_MESSAGES } from './messages';
import type { BackupModule } from './types';

/** The Undo_Toast label of a committed import (R7.11). */
export const IMPORT_UNDO_LABEL = 'Backup imported';

/** The core tables an import replaces. `core_secrets` and `core_meta` are never in scope (R7.9, R8.6). */
export const IMPORT_CORE_TABLES: readonly string[] = [CORE_TABLES.profile, CORE_TABLES.settings];

/** The import transaction failed; Dexie rolled it back, so the stored data is unchanged (R7.10). */
export class BackupImportError extends Error {
  override readonly name = 'BackupImportError';
  constructor(
    /** Short, fixed reason, e.g. "device storage is full". */
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(IMPORT_MESSAGES.applyFailed(reason), options);
  }
}

export interface ApplyImportOptions {
  database?: Dexie;
  /** The registry the plan was checked against; `MODULES` by default. */
  modules?: readonly BackupModule[];
  /** Receives the Undo_Toast action; the App's `undoService` by default. */
  undo?: Pick<UndoService, 'push'>;
}

export interface ApplyImportResult {
  /** Module ids in the file that are not registered, in file order, for the result Toast (R7.7). */
  skipped: string[];
}

/** Every Dexie table of `mod`. */
function tablesOf(mod: BackupModule): string[] {
  return Object.keys(mod.tables).map((short) => moduleTableName(mod.id, short));
}

/** True when `table` stores its primary key outside the record (Dexie outbound keys). */
function hasOutboundKeys(database: Dexie, table: string): boolean {
  const keyPath = database.table(table).schema.primKey.keyPath;
  return keyPath === undefined || keyPath === null || keyPath === '';
}

/**
 * Puts every table of `snapshot` back to its captured contents in one transaction: each table is cleared and
 * its captured records are written under their primary keys. A failure changes nothing and rejects with
 * `DbWriteError` (R64.7).
 */
export async function restoreSnapshot(snapshot: TableSnapshot, database: Dexie = db): Promise<void> {
  const tables = Object.keys(snapshot);
  if (tables.length === 0) return;
  await write(
    tables,
    async () => {
      for (const name of tables) {
        const table = database.table(name);
        await table.clear();
        const records = snapshot[name]!;
        if (records.size === 0) continue;
        if (hasOutboundKeys(database, name)) {
          // Dexie types the keys as non-compound parts, but compound (array) keys are valid at runtime.
          await table.bulkPut([...records.values()], [...records.keys()] as unknown as IndexableTypeArrayReadonly);
        } else {
          await table.bulkPut([...records.values()]);
        }
      }
    },
    database,
  );
}

/**
 * Imports a checked Backup_File after the Owner confirmed it (R7.9):
 * 1. Snapshots the core Profile and settings and every table of the registered modules present in the file,
 *    before the transaction starts (R7.11).
 * 2. In one `rw` transaction over those tables: clears the core tables and writes the file's core data, then
 *    for each present module clears its tables and calls `importData` with its validated entry. Absent
 *    modules and `core_secrets` are outside the transaction, so they stay unchanged (R7.9, R8.6).
 * 3. On failure Dexie rolls everything back; this rejects with `BackupImportError` and pushes no undo (R7.10).
 * 4. On success pushes the "Backup imported" Undo_Toast, whose undo restores the snapshot (R7.11), and
 *    returns the skipped module ids for the result Toast (R7.7).
 */
export async function applyImport(plan: ImportPlan, options: ApplyImportOptions = {}): Promise<ApplyImportResult> {
  const database = options.database ?? db;
  const modules = options.modules ?? MODULES;
  const undo = options.undo ?? appUndoService;

  const byId = new Map(modules.map((m) => [m.id, m]));
  const present = plan.file.modules.map((entry) => {
    const mod = byId.get(entry.id);
    if (mod === undefined) throw new Error(`The import plan names module ${entry.id}, which is not registered`);
    return { mod, data: entry.data };
  });
  const tables = [...IMPORT_CORE_TABLES, ...present.flatMap(({ mod }) => tablesOf(mod))];

  let snapshot: TableSnapshot;
  try {
    snapshot = await captureSnapshot(tables, {}, database);
    await write(
      tables,
      async () => {
        const profiles = database.table(CORE_TABLES.profile);
        const settings = database.table(CORE_TABLES.settings);
        await profiles.clear();
        await settings.clear();
        const { profile, settings: records } = plan.file.core;
        if (profile !== null) await profiles.put(stripUndefined(profile));
        if (records.length > 0) await settings.bulkPut(records.map((s) => stripUndefined({ key: s.key, value: s.value })));
        for (const { mod, data } of present) {
          for (const name of tablesOf(mod)) await database.table(name).clear();
          await mod.importData(data);
        }
      },
      database,
    );
  } catch (error) {
    throw new BackupImportError(toDbWriteError(error).reason, { cause: error });
  }

  undo.push({ label: IMPORT_UNDO_LABEL, undo: () => restoreSnapshot(snapshot, database) });
  return { skipped: [...plan.skipped] };
}
