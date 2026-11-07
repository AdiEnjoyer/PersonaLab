import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type Dexie from 'dexie';
import type { IndexableType } from 'dexie';
import { createDatabase, openDatabase } from '../../db/db';
import { write } from '../../db/write';
import { arbText } from '../../../test/arbitraries/core';
import { withTempDb } from '../../../test/helpers/db';
import { captureSnapshot, recordDiffUndo, type SnapshotKeys } from '../recordDiff';
import { createUndoService, type UndoAction } from '../undoService';

/**
 * Generic test tables: two inbound-key tables with unique Idempotency_Keys and an index, and one outbound-key
 * table. Task 38.4 extends this test to every module destructive action listed in the property.
 */
const STORES = { alpha: '&id, &idemKey', beta: '&id, &idemKey, group', gamma: '' };
type TableName = keyof typeof STORES;
const TABLES = Object.keys(STORES) as TableName[];
const INBOUND: ReadonlySet<TableName> = new Set(['alpha', 'beta']);

interface Fields {
  name: string;
  group: number;
  position: number;
  note?: string;
}

interface Row {
  key: string;
  fields: Fields;
}

type State = Record<TableName, Row[]>;

const arbFields: fc.Arbitrary<Fields> = fc.record(
  {
    name: arbText(0, 12),
    group: fc.integer({ min: 0, max: 3 }),
    position: fc.integer({ min: 0, max: 1000 }),
    note: arbText(0, 6),
  },
  { requiredKeys: ['name', 'group', 'position'] },
);

const arbRows: fc.Arbitrary<Row[]> = fc.uniqueArray(
  fc.record({ key: fc.uuid(), fields: arbFields }),
  { minLength: 0, maxLength: 15, selector: (row) => row.key },
);

const arbState: fc.Arbitrary<State> = fc.record({ alpha: arbRows, beta: arbRows, gamma: arbRows });

type Action =
  /** Deletes one record (or a key that does not exist when the table is empty). */
  | { kind: 'delete'; table: TableName; pick: number }
  /** Replaces one record: overwrites it under its key, or deletes it and adds a new record under a new key. */
  | { kind: 'replace'; table: TableName; pick: number; sameKey: boolean; fields: Fields; fresh: string }
  /** Deletes a subset of a table's records, or all of them (captured as a whole table). */
  | { kind: 'bulkDelete'; table: TableName; chosen: boolean[]; all: boolean };

const arbTable = fc.constantFrom(...TABLES);

const arbAction: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ kind: fc.constant('delete' as const), table: arbTable, pick: fc.nat() }),
  fc.record({
    kind: fc.constant('replace' as const),
    table: arbTable,
    pick: fc.nat(),
    sameKey: fc.boolean(),
    fields: arbFields,
    fresh: fc.uuid(),
  }),
  fc.record({
    kind: fc.constant('bulkDelete' as const),
    table: arbTable,
    chosen: fc.array(fc.boolean(), { minLength: 15, maxLength: 15 }),
    all: fc.boolean(),
  }),
);

/** The stored record of a row: inbound tables keep the key in `id` next to a unique Idempotency_Key. */
function recordOf(table: TableName, key: string, fields: Fields, idemKey: string): Record<string, unknown> {
  return INBOUND.has(table) ? { id: key, idemKey, ...fields } : { idemKey, ...fields };
}

async function putRecord(database: Dexie, table: TableName, key: string, record: Record<string, unknown>) {
  if (INBOUND.has(table)) await database.table(table).put(record);
  else await database.table(table).put(record, key);
}

async function seed(database: Dexie, state: State) {
  await write(
    TABLES,
    async () => {
      for (const table of TABLES) {
        for (const row of state[table]) await putRecord(database, table, row.key, recordOf(table, row.key, row.fields, `idem-${row.key}`));
      }
    },
    database,
  );
}

/** Every record of every table with its primary key, in primary-key order. */
async function dump(database: Dexie) {
  const out: Record<string, [IndexableType, unknown][]> = {};
  for (const table of TABLES) {
    const rows: [IndexableType, unknown][] = [];
    await database.table(table).toCollection().each((record, cursor) => {
      rows.push([cursor.primaryKey, record]);
    });
    out[table] = rows;
  }
  return out;
}

/** Performs `action` in one transaction with before/after snapshots and returns its record-diff undo. */
async function perform(database: Dexie, action: Action, index: number): Promise<UndoAction> {
  const table = action.table;
  const existing = (await database.table(table).toCollection().primaryKeys()) as string[];
  const pick = action.kind === 'bulkDelete' ? 0 : action.pick;
  const picked = existing.length === 0 ? `missing-${index}` : existing[pick % existing.length]!;

  let keys: SnapshotKeys;
  let mutate: () => Promise<void>;
  switch (action.kind) {
    case 'delete':
      keys = { [table]: [picked] };
      mutate = () => database.table(table).delete(picked);
      break;
    case 'replace': {
      const newKey = action.sameKey ? picked : `rep${index}-${action.fresh}`;
      const replacement = recordOf(table, newKey, action.fields, `rep${index}-idem-${action.fresh}`);
      keys = { [table]: action.sameKey ? [picked] : [picked, newKey] };
      mutate = async () => {
        if (!action.sameKey) await database.table(table).delete(picked);
        await putRecord(database, table, newKey, replacement);
      };
      break;
    }
    case 'bulkDelete': {
      const doomed = action.all ? existing : existing.filter((_, i) => action.chosen[i % action.chosen.length]!);
      keys = action.all ? {} : { [table]: doomed };
      mutate = async () => {
        if (action.all) await database.table(table).clear();
        else await database.table(table).bulkDelete(doomed);
      };
      break;
    }
  }

  return write(
    [table],
    async () => {
      const before = await captureSnapshot([table], keys, database);
      await mutate();
      const after = await captureSnapshot([table], keys, database);
      return recordDiffUndo(`${action.kind} in ${table}`, before, after, database);
    },
    database,
  );
}

describe('recordDiffUndo with the Undo service', () => {
  it('performing a destructive action and then Undo restores the exact previous state; a second tap changes nothing', async () => {
    // Feature: personal-lab, Property 23: Undo restores the exact previous state
    await fc.assert(
      fc.asyncProperty(arbState, fc.option(arbAction, { nil: undefined }), arbAction, async (state, earlier, action) => {
        await withTempDb(
          (name) => createDatabase(name, { initialStores: STORES, migrations: [], currentStores: STORES }),
          async (database) => {
            expect(await openDatabase(database)).toEqual({ ok: true });
            await seed(database, state);
            const service = createUndoService();

            // An earlier action is finalised by the next push and stays written (R64.4).
            if (earlier !== undefined) service.push(await perform(database, earlier, 0));
            const beforeAction = await dump(database);

            const undo = await perform(database, action, 1);
            let calls = 0;
            service.push({
              label: undo.label,
              undo: () => {
                calls += 1;
                return undo.undo();
              },
            });

            // Two quick taps, then a later one: the undo runs once.
            await Promise.all([service.undo(), service.undo()]);
            expect(service.getState()).toEqual({ status: 'idle' });
            expect(await dump(database)).toStrictEqual(beforeAction);

            await service.undo();
            expect(calls).toBe(1);
            expect(await dump(database)).toStrictEqual(beforeAction);
          },
        );
      }),
      { numRuns: 100 },
    );
  }, 180_000);
});
