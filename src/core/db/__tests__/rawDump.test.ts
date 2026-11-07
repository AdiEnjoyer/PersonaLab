import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { MODULES } from '../../registry/modules';
import { uniqueDbName } from '../../../test/helpers/db';
import { createDatabase, openDatabase } from '../db';
import { emergencyExport, moduleDataVersionsFor } from '../rawDump';
import { buildStores } from '../tables';
import type { DbMigration } from '../versions';

const APP_STORES = buildStores(MODULES);
const NOW = new Date(2025, 2, 7, 9, 5);

const profile = { id: 'profile', age: 30, sex: 'male', heightCm: 180, weightKg: 80, weeklyTrainingHours: 4, goal: 'cut', updatedAt: 1 };

async function seedV1(database: Dexie) {
  await database.table('core_profile').put(profile);
  await database.table('core_settings').bulkPut([
    { key: 'gym.defaultRestSec', value: 120 },
    { key: 'core.backupReminderDays', value: 'off' },
  ]);
  await database.table('core_secrets').put({ key: 'nutrition.geminiKey', value: 'AIzaNeverExported' });
  await database.table('core_meta').put({ key: 'lastBackupAt', value: 5 });
  await database.table('gym_images').put({ id: 'img', mime: 'image/jpeg', bytes: new Uint8Array([1, 2, 255]).buffer, width: 2, height: 1 });
  await database.table('gym_sessions').bulkPut([
    { id: 's2', status: 'finished', startedAt: 2, finishedAt: 3, entries: [{ sets: [{ weight: 62.5 }] }] },
    { id: 's1', status: 'active', startedAt: 1, entries: [] },
  ]);
  await database.table('nutrition_dayMarks').put({ date: '2025-03-01', done: true, note: 'שלום 🍎' });
  await database.table('chess_evals').put({ gameId: 'g', depth: 18, version: 1, ply: 3, cp: -21 });
}

async function readFile(file: Blob) {
  return JSON.parse(await file.text()) as {
    format: string;
    schemaVersion: number;
    exportedAt: string;
    core: { profile: unknown; settings: unknown[] };
    modules: Array<{ id: string; dataVersion: number; data: Record<string, unknown[]> }>;
  };
}

describe('emergencyExport', () => {
  it('writes every record of a stored database without upgrading it, and no secret or meta record', async () => {
    const name = uniqueDbName('raw');
    const stored = createDatabase(name, { initialStores: APP_STORES, migrations: [], currentStores: APP_STORES });
    await stored.open();
    await seedV1(stored);
    stored.close();

    // The App now declares version 2 with an upgrade that throws: the open fails and the data stays at v1.
    const failing: DbMigration = {
      version: 2,
      upgrade: () => Promise.reject(new Error('broken upgrade')),
      moduleDataVersions: { gym: 2, nutrition: 1, chess: 1 },
    };
    const app = createDatabase(name, { initialStores: APP_STORES, migrations: [failing], currentStores: APP_STORES });
    expect(await openDatabase(app)).toMatchObject({ ok: false, reason: 'migration-failed', storedVersion: 1 });
    app.close();

    try {
      const file = await emergencyExport({ name, now: NOW, migrations: [failing] });
      expect(file.name).toBe('personallab-backup-2025-03-07-0905.json');
      expect(file.type).toBe('application/json');
      const text = await file.text();
      expect(text).not.toContain('AIzaNeverExported');
      expect(text).not.toContain('lastBackupAt');

      const backup = await readFile(file);
      expect(backup.format).toBe('personallab-backup');
      expect(backup.schemaVersion).toBe(1);
      expect(backup.core).toEqual({
        profile,
        settings: [
          { key: 'core.backupReminderDays', value: 'off' },
          { key: 'gym.defaultRestSec', value: 120 },
        ],
      });
      expect(backup.modules.map((m) => [m.id, m.dataVersion])).toEqual([
        ['gym', 1],
        ['nutrition', 1],
        ['chess', 1],
      ]);
      const [gym, nutrition, chess] = backup.modules;
      expect(gym!.data.images).toEqual([{ id: 'img', mime: 'image/jpeg', base64: 'AQL/', width: 2, height: 1 }]);
      expect(gym!.data.sessions).toEqual([
        { id: 's1', status: 'active', startedAt: 1, entries: [] },
        { id: 's2', status: 'finished', startedAt: 2, finishedAt: 3, entries: [{ sets: [{ weight: 62.5 }] }] },
      ]);
      expect(gym!.data.routines).toEqual([]);
      expect(nutrition!.data.dayMarks).toEqual([{ date: '2025-03-01', done: true, note: 'שלום 🍎' }]);
      expect(chess!.data.evals).toEqual([{ gameId: 'g', depth: 18, version: 1, ply: 3, cp: -21 }]);

      // Every stored table appears; nothing was upgraded.
      const exportedTables = backup.modules.flatMap((m) => Object.keys(m.data).map((short) => `${m.id}_${short}`));
      expect(exportedTables.sort()).toEqual(Object.keys(APP_STORES).filter((t) => !t.startsWith('core_')).sort());
      const probe = new Dexie(name);
      await probe.open();
      expect(probe.verno).toBe(1);
      probe.close();
    } finally {
      await Dexie.delete(name);
    }
  });

  it('uses the module data versions recorded for a stored version above 1 and keeps outbound keys', async () => {
    const name = uniqueDbName('raw');
    const v2: DbMigration = { version: 2, stores: { gym_notes: '' }, moduleDataVersions: { gym: 2, nutrition: 1, chess: 3 } };
    const stored = createDatabase(name, { initialStores: APP_STORES, migrations: [v2], currentStores: { ...APP_STORES, gym_notes: '' } });
    await stored.open();
    await stored.table('gym_notes').put({ text: 'note' }, 'n1');
    stored.close();
    try {
      const backup = await readFile(await emergencyExport({ name, now: NOW, migrations: [v2] }));
      expect(backup.modules.map((m) => [m.id, m.dataVersion])).toEqual([
        ['gym', 2],
        ['nutrition', 1],
        ['chess', 3],
      ]);
      expect(backup.modules[0]!.data.notes).toEqual([{ key: 'n1', value: { text: 'note' } }]);
      expect(backup.core).toEqual({ profile: null, settings: [] });
    } finally {
      await Dexie.delete(name);
    }
  });
});

describe('moduleDataVersionsFor', () => {
  it('returns the version 1 data versions and throws for an undeclared version', () => {
    expect(moduleDataVersionsFor(1)).toEqual({ gym: 1, nutrition: 1, chess: 1 });
    expect(() => moduleDataVersionsFor(4, [])).toThrow('database version 4');
  });
});
