import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { MODULES } from '../../registry/modules';
import { installChangeTracker, type ChangeTracking } from '../changeTracker';
import { createDatabase, openDatabase } from '../db';
import { buildStores, CORE_TABLES, META_KEYS } from '../tables';
import { uniqueDbName } from '../../../test/helpers/db';

let database: Dexie;
let tracking: ChangeTracking;
let clock: number;

const stores = buildStores(MODULES);

beforeEach(async () => {
  clock = 1_000;
  database = createDatabase(uniqueDbName(), { initialStores: stores, migrations: [], currentStores: stores });
  tracking = installChangeTracker(database, () => clock);
  expect(await openDatabase(database)).toEqual({ ok: true });
});

afterEach(async () => {
  await tracking.idle();
  database.close();
  await Dexie.delete(database.name);
});

async function meta(): Promise<Record<string, unknown>> {
  await tracking.idle();
  const rows = await database.table<{ key: string; value: unknown }>(CORE_TABLES.meta).toArray();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

describe('change tracking', () => {
  it('sets lastDataChangeAt and firstDataAt after a module write', async () => {
    await database.table('gym_routines').put({ id: 'r1', idemKey: 'k1', createdAt: 1 });
    expect(await meta()).toEqual({ [META_KEYS.lastDataChangeAt]: 1_000, [META_KEYS.firstDataAt]: 1_000 });
  });

  it('keeps firstDataAt and moves lastDataChangeAt on later writes, including deletes', async () => {
    await database.table('nutrition_dayMarks').put({ date: '2025-03-07' });
    clock = 5_000;
    await database.table('nutrition_dayMarks').delete('2025-03-07');
    expect(await meta()).toEqual({ lastDataChangeAt: 5_000, firstDataAt: 1_000 });
    clock = 9_000;
    await database.table(CORE_TABLES.profile).put({ id: 'profile', age: 30 });
    expect((await meta())['lastDataChangeAt']).toBe(9_000);
    clock = 12_000;
    await database.table(CORE_TABLES.settings).put({ key: 'core.backupReminderDays', value: 7 });
    expect(await meta()).toEqual({ lastDataChangeAt: 12_000, firstDataAt: 1_000 });
  });

  it('counts writes inside an explicit multi-table transaction once it commits', async () => {
    await database.transaction('rw', ['chess_games', 'chess_ratings'], async () => {
      await database.table('chess_games').add({ id: 'g1', endTime: 1, syncedFor: 'me' });
      await database.table('chess_ratings').put({ id: 'rapid', rating: 1500 });
    });
    expect(await meta()).toEqual({ lastDataChangeAt: 1_000, firstDataAt: 1_000 });
  });

  it('does not count writes to core_secrets or core_meta', async () => {
    await database.table(CORE_TABLES.secrets).put({ key: 'nutrition.geminiKey', value: 'abcd1234' });
    await database.table(CORE_TABLES.meta).put({ key: META_KEYS.lastBackupAt, value: 77 });
    await database.table(CORE_TABLES.secrets).delete('nutrition.geminiKey');
    expect(await meta()).toEqual({ lastBackupAt: 77 });
  });

  it('does not count a transaction that aborts', async () => {
    await expect(
      database.transaction('rw', 'gym_routines', async () => {
        await database.table('gym_routines').put({ id: 'r1', idemKey: 'k1', createdAt: 1 });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    await expect(database.table('gym_routines').count()).resolves.toBe(0);
    expect(await meta()).toEqual({});
  });

  it('does not count empty bulk writes', async () => {
    await database.table('gym_routines').bulkPut([]);
    await database.table('gym_routines').bulkDelete([]);
    expect(await meta()).toEqual({});
  });

  it('does not count records written by a schema upgrade', async () => {
    const name = database.name;
    await database.table(CORE_TABLES.meta).put({ key: META_KEYS.lastBackupAt, value: 1 });
    await tracking.idle();
    database.close();
    const v2 = new Dexie(name);
    v2.version(1).stores(stores);
    v2.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table('gym_routines').put({ id: 'migrated', idemKey: 'm', createdAt: 1 });
      });
    const v2Tracking = installChangeTracker(v2, () => clock);
    expect(await openDatabase(v2)).toEqual({ ok: true });
    await v2Tracking.idle();
    await expect(v2.table('gym_routines').count()).resolves.toBe(1);
    const rows = await v2.table(CORE_TABLES.meta).toArray();
    expect(rows).toEqual([{ key: META_KEYS.lastBackupAt, value: 1 }]);
    v2.close();
  });
});
