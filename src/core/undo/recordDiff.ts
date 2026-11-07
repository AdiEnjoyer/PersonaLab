import type Dexie from 'dexie';
import type { IndexableType, IndexableTypeArrayReadonly } from 'dexie';
import { db } from '../db/db';
import { write } from '../db/write';
import type { UndoAction } from './undoService';

/**
 * The records an action touches, by table name and primary key. A key that is absent from a table's map
 * did not exist when the snapshot was taken.
 */
export type TableSnapshot = Record<string, Map<IndexableType, unknown>>;

/** Primary keys to capture, by table. A table without an entry is captured whole. */
export type SnapshotKeys = Readonly<Record<string, readonly IndexableType[]>>;

/**
 * Reads the current records of `tables`: for a table listed in `keys`, the records at those primary keys
 * (missing ones are left out of the map); for any other table, every record. The reads run in one read
 * transaction, or inside the caller's transaction when it covers `tables`, so call it before and after the
 * action inside the action's `write(...)` to get consistent `before` and `after` snapshots.
 */
export async function captureSnapshot(
  tables: readonly string[],
  keys: SnapshotKeys = {},
  database: Dexie = db,
): Promise<TableSnapshot> {
  if (tables.length === 0) return {};
  return database.transaction('r', tables, async () => {
    const snapshot: TableSnapshot = {};
    for (const name of tables) {
      const table = database.table(name);
      const map = new Map<IndexableType, unknown>();
      const wanted = Object.hasOwn(keys, name) ? keys[name] : undefined;
      if (wanted === undefined) {
        await table.toCollection().each((record, cursor) => {
          map.set(cursor.primaryKey, record);
        });
      } else if (wanted.length > 0) {
        const records = await table.bulkGet([...wanted]);
        records.forEach((record, i) => {
          if (record !== undefined) map.set(wanted[i]!, record);
        });
      }
      snapshot[name] = map;
    }
    return snapshot;
  });
}

/** True when `table` stores its primary key outside the record (Dexie outbound keys). */
function hasOutboundKeys(database: Dexie, table: string): boolean {
  const keyPath = database.table(table).schema.primKey.keyPath;
  return keyPath === undefined || keyPath === null || keyPath === '';
}

/** A deep copy of `snapshot`, so later changes to the captured objects cannot alter the undo data. */
function freeze(snapshot: TableSnapshot): TableSnapshot {
  const copy: TableSnapshot = {};
  for (const [table, records] of Object.entries(snapshot)) copy[table] = structuredClone(records);
  return copy;
}

/**
 * An undo that restores the records of `before`, in one transaction (R64.2):
 * - every key captured in `after` is deleted, which removes the records the action created;
 * - every record captured in `before` is put back under its primary key, which restores deleted and changed
 *   records with their original values, Idempotency_Keys, relations and positions (R64.3).
 * Keys in both snapshots are deleted and put back in the same transaction, so they end with their `before`
 * values. A failed transaction changes nothing and rejects with `DbWriteError` (R64.7).
 */
export function recordDiffUndo(
  label: string,
  before: TableSnapshot,
  after: TableSnapshot,
  database: Dexie = db,
): UndoAction {
  const saved = freeze(before);
  const createdOrChanged = Object.fromEntries(Object.entries(after).map(([table, records]) => [table, [...records.keys()]]));
  const tables = [...new Set([...Object.keys(saved), ...Object.keys(createdOrChanged)])];

  return {
    label,
    undo: async () => {
      if (tables.length === 0) return;
      await write(
        tables,
        async () => {
          for (const name of tables) {
            const table = database.table(name);
            const remove = createdOrChanged[name] ?? [];
            if (remove.length > 0) await table.bulkDelete(remove);
            const restore = saved[name];
            if (restore === undefined || restore.size === 0) continue;
            // Dexie types the keys as non-compound parts, but compound (array) keys are valid at runtime.
            if (hasOutboundKeys(database, name)) {
              await table.bulkPut([...restore.values()], [...restore.keys()] as unknown as IndexableTypeArrayReadonly);
            } else {
              await table.bulkPut([...restore.values()]);
            }
          }
        },
        database,
      );
    },
  };
}
