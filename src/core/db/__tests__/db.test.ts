import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { MODULES } from '../../registry/modules';
import { createDatabase, db, DB_NAME, openDatabase, type SchemaConfig } from '../db';
import { buildStores, CORE_STORES, moduleTableName } from '../tables';
import { DB_VERSION, MIGRATIONS, MODULE_DATA_VERSIONS_V1, assertMigrationOrder, declaredVersion, type DbMigration } from '../versions';
import { uniqueDbName, withFreshDb } from '../../../test/helpers/db';

const opened: Dexie[] = [];
const names: string[] = [];

afterEach(async () => {
  for (const d of opened.splice(0)) d.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});

function track(database: Dexie): Dexie {
  opened.push(database);
  names.push(database.name);
  return database;
}

const V1: Record<string, string> = { items: '&id, kind', notes: '&id' };
const config = (migrations: DbMigration[] = [], current = V1): SchemaConfig => ({ initialStores: V1, migrations, currentStores: current });

/** Creates `name` at schema version 1 with the given records, then closes it. */
async function seedV1(name: string, items: unknown[], notes: unknown[] = []): Promise<void> {
  const seed = new Dexie(name);
  seed.version(1).stores(V1);
  await seed.table('items').bulkAdd(items);
  await seed.table('notes').bulkAdd(notes);
  seed.close();
}

/** Reads the stored version and every record without upgrading or creating anything. */
async function inspect(name: string): Promise<{ version: number; tables: Record<string, unknown[]> }> {
  const probe = new Dexie(name);
  await probe.open();
  try {
    const tables: Record<string, unknown[]> = {};
    for (const table of probe.tables) tables[table.name] = await table.toArray();
    return { version: probe.backendDB().version / 10, tables };
  } finally {
    probe.close();
  }
}

describe('buildStores', () => {
  it('names module tables `${id}_${short}` in registry order, then the core stores', () => {
    const stores = buildStores([
      { id: 'gym', tables: { sessions: '&id, status', images: '&id' } },
      { id: 'chess', tables: { games: '&id' } },
    ]);
    expect(Object.entries(stores)).toEqual([
      ['gym_sessions', '&id, status'],
      ['gym_images', '&id'],
      ['chess_games', '&id'],
      ['core_profile', '&id'],
      ['core_settings', '&key'],
      ['core_secrets', '&key'],
      ['core_meta', '&key'],
    ]);
    expect(moduleTableName('nutrition', 'foodEntries')).toBe('nutrition_foodEntries');
  });

  it('rejects two declarations of the same store name', () => {
    expect(() => buildStores([{ id: 'core', tables: { meta: '&key' } }])).toThrow('Duplicate database table name: core_meta');
    expect(() => buildStores([{ id: 'a_b', tables: { c: '&id' } }, { id: 'a', tables: { b_c: '&id' } }])).toThrow('a_b_c');
  });
});

describe('versions', () => {
  it('declares version 1 with no migrations and data version 1 for every module', () => {
    expect(DB_VERSION).toBe(1);
    expect(MIGRATIONS).toEqual([]);
    expect(declaredVersion(MIGRATIONS)).toBe(DB_VERSION);
    expect(MODULE_DATA_VERSIONS_V1).toEqual({ gym: 1, nutrition: 1, chess: 1 });
    expect(Object.keys(MODULE_DATA_VERSIONS_V1)).toEqual(MODULES.map((m) => m.id));
  });

  it('requires migrations numbered 2, 3, … without gaps', () => {
    const m = (version: number): DbMigration => ({ version, moduleDataVersions: {} });
    expect(() => assertMigrationOrder([m(2), m(3)])).not.toThrow();
    expect(() => assertMigrationOrder([m(3)])).toThrow('expected 2');
    expect(() => assertMigrationOrder([m(2), m(2)])).toThrow('expected 3');
    expect(declaredVersion([m(2), m(3)])).toBe(3);
  });
});

describe('the App database', () => {
  it('is named personallab and declares every module and core store at DB_VERSION', async () => {
    expect(db.name).toBe(DB_NAME);
    expect(db.verno).toBe(DB_VERSION);
    await withFreshDb(async (database) => {
      const expected = buildStores(MODULES);
      expect(database.tables.map((t) => t.name).sort()).toEqual(Object.keys(expected).sort());
      expect(Object.keys(expected)).toContain('gym_sessions');
      for (const name of Object.keys(CORE_STORES)) expect(database.table(name)).toBeDefined();
      expect(database.table('chess_evals').schema.primKey.keyPath).toEqual(['gameId', 'depth', 'version', 'ply']);
      expect(database.table('nutrition_weights').schema.idxByName['date']?.unique).toBe(true);
    });
  });
});

describe('openDatabase', () => {
  it('creates and opens a new database', async () => {
    const database = track(createDatabase(uniqueDbName(), config()));
    await expect(openDatabase(database)).resolves.toEqual({ ok: true });
    expect(database.isOpen()).toBe(true);
    await database.table('items').put({ id: 'a', kind: 'x' });
    database.close();
    const state = await inspect(database.name);
    expect(state.version).toBe(1);
    expect(state.tables).toEqual({ items: [{ id: 'a', kind: 'x' }], notes: [] });
  });

  it('opens an existing database at the declared version and keeps its records', async () => {
    const name = uniqueDbName();
    names.push(name);
    await seedV1(name, [{ id: 'a', kind: 'x' }], [{ id: 'n' }]);
    const database = track(createDatabase(name, config()));
    await expect(openDatabase(database)).resolves.toEqual({ ok: true });
    await expect(database.table('items').toArray()).resolves.toEqual([{ id: 'a', kind: 'x' }]);
  });

  it('reports newer-version for a database stored at version 2 and changes nothing', async () => {
    const name = uniqueDbName();
    names.push(name);
    const newer = new Dexie(name);
    newer.version(2).stores({ items: '&id, kind, extra', later: '&id' });
    await newer.table('items').add({ id: 'a', kind: 'x', extra: 1 });
    await newer.table('later').add({ id: 'l' });
    newer.close();
    const before = await inspect(name);

    const database = track(createDatabase(name, config([], { ...V1, added: '&id' })));
    await expect(openDatabase(database)).resolves.toEqual({ ok: false, reason: 'newer-version', storedVersion: 2 });
    expect(database.isOpen()).toBe(false);

    const after = await inspect(name);
    expect(after).toEqual(before);
    expect(after.version).toBe(2);
    expect(Object.keys(after.tables).sort()).toEqual(['items', 'later']);
  });

  it('reports migration-failed when an upgrade throws, leaving version 1 and every record unchanged', async () => {
    const name = uniqueDbName();
    names.push(name);
    const items = [
      { id: 'a', kind: 'x', value: 1 },
      { id: 'b', kind: 'y', value: 2 },
    ];
    await seedV1(name, items, [{ id: 'n', text: 'note' }]);
    const before = await inspect(name);

    const failing: DbMigration = {
      version: 2,
      stores: { items: '&id, kind, value', added: '&id' },
      upgrade: async (tx) => {
        await tx.table('items').toCollection().modify((r: { value: number }) => {
          r.value *= 10;
        });
        await tx.table('notes').clear();
        throw new Error('boom in v2');
      },
      moduleDataVersions: {},
    };
    const database = track(createDatabase(name, config([failing], { ...V1, items: '&id, kind, value', added: '&id' })));
    const result = await openDatabase(database);
    expect(result).toMatchObject({ ok: false, reason: 'migration-failed', storedVersion: 1 });
    expect(result.ok === false && 'error' in result ? result.error : '').toContain('boom in v2');
    expect(database.isOpen()).toBe(false);
    database.close();

    const after = await inspect(name);
    expect(after).toEqual(before);
    expect(after.version).toBe(1);

    // The next start attempts the migration again; with a working step it succeeds.
    const fixed = track(
      createDatabase(name, config([{ ...failing, upgrade: async () => undefined }], { ...V1, items: '&id, kind, value', added: '&id' })),
    );
    await expect(openDatabase(fixed)).resolves.toEqual({ ok: true });
    await expect(fixed.table('items').toArray()).resolves.toEqual(items);
  });

  it('reports unavailable when IndexedDB cannot be used, without deleting anything', async () => {
    const denied = () => new DOMException('The operation is insecure.', 'SecurityError');
    const noDatabases = {
      open: () => {
        throw denied();
      },
      databases: () => Promise.reject(denied()),
      deleteDatabase: () => {
        throw new Error('must not delete');
      },
      cmp: (a: number, b: number) => a - b,
    };
    const blocked = new Dexie(uniqueDbName(), { indexedDB: noDatabases, IDBKeyRange });
    blocked.version(1).stores(V1);
    const first = await openDatabase(blocked);
    expect(first).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(first.ok === false && 'error' in first ? first.error : '').toContain('SecurityError');

    const openFails = { ...noDatabases, databases: () => Promise.resolve([]) };
    const blocked2 = new Dexie(uniqueDbName(), { indexedDB: openFails, IDBKeyRange });
    blocked2.version(1).stores(V1);
    await expect(openDatabase(blocked2)).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
  });
});
