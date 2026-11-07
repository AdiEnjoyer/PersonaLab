import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { createDatabase, openDatabase } from '../../db/db';
import { DbWriteError } from '../../db/errors';
import { write } from '../../db/write';
import { installWriteFailures, uniqueDbName, type WriteFailures } from '../../../test/helpers/db';
import { captureSnapshot, recordDiffUndo } from '../recordDiff';
import { createUndoService } from '../undoService';

interface Item {
  id: string;
  idemKey: string;
  name: string;
  position: number;
}

const STORES = { items: '&id, &idemKey, position', tags: '&id', loose: '' };

let database: Dexie;
let failures: WriteFailures;

const item = (id: string, position: number, name = `item ${id}`): Item => ({ id, idemKey: `k-${id}`, name, position });

async function dump() {
  const out: Record<string, [unknown, unknown][]> = {};
  for (const table of database.tables) {
    const rows: [unknown, unknown][] = [];
    await table.toCollection().each((record, cursor) => {
      rows.push([cursor.primaryKey, record]);
    });
    out[table.name] = rows;
  }
  return out;
}

beforeEach(async () => {
  database = createDatabase(uniqueDbName('undo'), { initialStores: STORES, migrations: [], currentStores: STORES });
  failures = installWriteFailures(database);
  expect(await openDatabase(database)).toEqual({ ok: true });
  await database.table('items').bulkAdd([item('a', 0), item('b', 1), item('c', 2)]);
  await database.table('tags').bulkAdd([{ id: 't1', itemId: 'a' }, { id: 't2', itemId: 'b' }]);
  await database.table('loose').bulkAdd([{ v: 1 }, { v: 2 }], ['x', 'y']);
});

afterEach(async () => {
  database.close();
  await Dexie.delete(database.name);
});

describe('captureSnapshot', () => {
  it('captures the listed keys of a table, leaving out missing ones', async () => {
    const snap = await captureSnapshot(['items'], { items: ['b', 'zz'] }, database);
    expect([...snap.items!.entries()]).toEqual([['b', item('b', 1)]]);
  });

  it('captures a whole table when it has no key list, with outbound keys', async () => {
    const snap = await captureSnapshot(['tags', 'loose'], {}, database);
    expect([...snap.tags!.keys()]).toEqual(['t1', 't2']);
    expect([...snap.loose!.entries()]).toEqual([
      ['x', { v: 1 }],
      ['y', { v: 2 }],
    ]);
  });
});

describe('recordDiffUndo', () => {
  it('restores deleted, changed and created records in one transaction', async () => {
    const initial = await dump();
    const tables = ['items', 'tags', 'loose'];
    const keys = { items: ['a', 'b', 'n'], tags: ['t1'], loose: ['x', 'z'] };
    const { before, after } = await write(
      tables,
      async () => {
        const before = await captureSnapshot(tables, keys, database);
        await database.table('items').delete('a');
        await database.table('items').put(item('b', 7, 'renamed'));
        await database.table('items').add(item('n', 3));
        await database.table('tags').delete('t1');
        await database.table('loose').put({ v: 9 }, 'x');
        await database.table('loose').add({ v: 3 }, 'z');
        const after = await captureSnapshot(tables, keys, database);
        return { before, after };
      },
      database,
    );
    expect(await dump()).not.toEqual(initial);

    await recordDiffUndo('Items deleted', before, after, database).undo();
    expect(await dump()).toEqual(initial);
  });

  it('keeps its undo data when the caller later mutates the captured objects', async () => {
    const initial = await dump();
    const before = await captureSnapshot(['items'], { items: ['a'] }, database);
    await database.table('items').delete('a');
    const after = await captureSnapshot(['items'], { items: ['a'] }, database);
    const undo = recordDiffUndo('Item deleted', before, after, database);
    (before.items!.get('a') as Item).name = 'mutated';
    await undo.undo();
    expect(await dump()).toEqual(initial);
  });

  it('a failing undo keeps the after-state and the service reports the reason', async () => {
    const service = createUndoService();
    const keys = { items: ['a', 'b'] };
    const before = await captureSnapshot(['items'], keys, database);
    await database.table('items').bulkDelete(['a', 'b']);
    const after = await captureSnapshot(['items'], keys, database);
    const afterState = await dump();

    service.push(recordDiffUndo('Items deleted', before, after, database));
    failures.failWhen(
      (table, req) => table === 'items' && req.type === 'put',
      () => new DOMException('The quota has been exceeded.', 'QuotaExceededError'),
    );
    await service.undo();
    failures.clear();

    expect(await dump()).toEqual(afterState);
    expect(service.getState()).toMatchObject({
      status: 'failed',
      label: 'Items deleted',
      reason: 'device storage is full',
      message: 'Could not undo: device storage is full.',
    });
  });

  it('rejects with DbWriteError when the transaction fails', async () => {
    const before = await captureSnapshot(['tags'], { tags: ['t1'] }, database);
    await database.table('tags').delete('t1');
    const undo = recordDiffUndo('Tag deleted', before, {}, database);
    failures.failNext('tags', () => new Error('disk'));
    await expect(undo.undo()).rejects.toBeInstanceOf(DbWriteError);
    await expect(database.table('tags').get('t1')).resolves.toBeUndefined();
  });

  it('does nothing for empty snapshots', async () => {
    const initial = await dump();
    await recordDiffUndo('Nothing', {}, {}, database).undo();
    expect(await dump()).toEqual(initial);
  });
});
