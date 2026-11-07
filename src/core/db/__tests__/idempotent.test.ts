import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { createIdempotent, MissingIdempotencyKeyError } from '../idempotent';
import { DbWriteError } from '../errors';
import { createDatabase, openDatabase } from '../db';
import { installWriteFailures, uniqueDbName, type WriteFailures } from '../../../test/helpers/db';

interface Thing {
  id: string;
  idemKey: string;
  name: string;
  note?: string;
}

let database: Dexie;
let failures: WriteFailures;
/** The number of next idemKey lookups that return nothing, as if another window had not yet committed. */
let staleLookups = 0;

function stale(index: string | null): boolean {
  if (staleLookups === 0 || index !== 'idemKey') return false;
  staleLookups -= 1;
  return true;
}

beforeEach(async () => {
  staleLookups = 0;
  const stores = { things: '&id, &idemKey', other: '&id, &idemKey' };
  database = createDatabase(uniqueDbName(), { initialStores: stores, migrations: [], currentStores: stores });
  database.use({
    stack: 'dbcore',
    name: 'staleIdemKeyLookups',
    create(down) {
      return {
        ...down,
        table(name: string) {
          const table = down.table(name);
          return {
            ...table,
            query: (req) => (stale(req.query.index.name) ? Promise.resolve({ result: [] }) : table.query(req)),
            openCursor: (req) => (stale(req.query.index.name) ? Promise.resolve(null) : table.openCursor(req)),
          };
        },
      };
    },
  });
  failures = installWriteFailures(database);
  expect(await openDatabase(database)).toEqual({ ok: true });
});

afterEach(async () => {
  database.close();
  await Dexie.delete(database.name);
});

const things = () => database.table<Thing>('things').toArray();

describe('createIdempotent', () => {
  it('creates a record once and returns it for every repeat, even with different field values', async () => {
    const first = await createIdempotent('things', { id: 'a', idemKey: 'k', name: 'first' }, database);
    expect(first).toEqual({ record: { id: 'a', idemKey: 'k', name: 'first' }, created: true });
    const repeat = await createIdempotent('things', { id: 'b', idemKey: 'k', name: 'changed' }, database);
    expect(repeat).toEqual({ record: { id: 'a', idemKey: 'k', name: 'first' }, created: false });
    await expect(things()).resolves.toEqual([{ id: 'a', idemKey: 'k', name: 'first' }]);
  });

  it('returns the in-flight create for concurrent repeats', async () => {
    const results = await Promise.all([
      createIdempotent('things', { id: 'a', idemKey: 'k', name: 'one' }, database),
      createIdempotent('things', { id: 'b', idemKey: 'k', name: 'two' }, database),
      createIdempotent('things', { id: 'c', idemKey: 'k', name: 'three' }, database),
    ]);
    expect(results.map((r) => r.created)).toEqual([true, false, false]);
    for (const r of results) expect(r.record).toEqual({ id: 'a', idemKey: 'k', name: 'one' });
    await expect(things()).resolves.toHaveLength(1);
  });

  it('keeps keys of different tables apart', async () => {
    await createIdempotent('things', { id: 'a', idemKey: 'k', name: 'x' }, database);
    const other = await createIdempotent('other', { id: 'a', idemKey: 'k', name: 'y' }, database);
    expect(other.created).toBe(true);
  });

  it('stores optional fields as absent', async () => {
    await createIdempotent('things', { id: 'a', idemKey: 'k', name: 'x', note: undefined }, database);
    const [stored] = await things();
    expect(Object.hasOwn(stored!, 'note')).toBe(false);
  });

  it('leaves no record when the create fails, and a retry with the same key creates it', async () => {
    failures.failNext('things', () => new DOMException('full', 'QuotaExceededError'));
    const draft: Thing = { id: 'a', idemKey: 'k', name: 'draft' };
    await expect(createIdempotent('things', draft, database)).rejects.toMatchObject({ name: 'DbWriteError', quota: true });
    await expect(things()).resolves.toEqual([]);
    await expect(createIdempotent('things', draft, database)).resolves.toEqual({ record: draft, created: true });
    await expect(things()).resolves.toEqual([draft]);
  });

  it('returns the stored record when another window wins the race (ConstraintError on idemKey)', async () => {
    await database.table('things').add({ id: 'winner', idemKey: 'k', name: 'other window' });
    staleLookups = 1;
    const result = await createIdempotent('things', { id: 'mine', idemKey: 'k', name: 'mine' }, database);
    expect(staleLookups).toBe(0);
    expect(result).toEqual({ record: { id: 'winner', idemKey: 'k', name: 'other window' }, created: false });
    await expect(things()).resolves.toHaveLength(1);
  });

  it('rejects an id collision with a different key as a DbWriteError', async () => {
    await createIdempotent('things', { id: 'a', idemKey: 'k1', name: 'x' }, database);
    await expect(createIdempotent('things', { id: 'a', idemKey: 'k2', name: 'y' }, database)).rejects.toBeInstanceOf(DbWriteError);
    await expect(things()).resolves.toHaveLength(1);
  });

  it('rejects a missing, empty or non-string key and writes nothing', async () => {
    const bad: unknown[] = [
      { id: 'a', name: 'x' },
      { id: 'a', name: 'x', idemKey: '' },
      { id: 'a', name: 'x', idemKey: undefined },
      { id: 'a', name: 'x', idemKey: 7 },
      { id: 'a', name: 'x', idemKey: null },
    ];
    for (const record of bad) {
      const attempt = createIdempotent('things', record as Thing, database);
      await expect(attempt).rejects.toBeInstanceOf(MissingIdempotencyKeyError);
      await expect(attempt).rejects.toMatchObject({ name: 'MissingIdempotencyKeyError', table: 'things' });
    }
    await expect(things()).resolves.toEqual([]);
  });
});
