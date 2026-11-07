/**
 * App-state generators for the backup properties, over core data plus a test registry of generic
 * table-backed modules (`alpha`, `beta`, `gamma`), so the backup properties run before the real modules
 * exist. Task 38.1 switches the round-trip properties to the real registry.
 */
import fc from 'fast-check';
import type Dexie from 'dexie';
import { z } from 'zod';
import { imageFromBackup, imageToBackup, toBase64, type ImageRecord } from '../../core/backup/base64';
import { BACKUP_FORMAT, SUPPORTED_SCHEMA_VERSION, toExportedAt } from '../../core/backup/format';
import { BackupImageSchema, type BackupImage, type BackupV1 } from '../../core/backup/schema';
import type { BackupModule } from '../../core/backup/types';
import { createDatabase, openDatabase } from '../../core/db/db';
import { stripUndefined } from '../../core/db/strip';
import { buildStores, CORE_TABLES, moduleTableName } from '../../core/db/tables';
import { GOALS, PROFILE_ID, SEXES, type Profile } from '../../core/profile/schema';
import type { SettingRecord } from '../../core/settings/repo';
import { SECRET_KEYS } from '../../core/settings/secrets';
import { BACKUP_REMINDER_INTERVALS } from '../../core/settings/schema';
import { withTempDb } from '../helpers/db';
import { arbEpoch, arbImageBytes, arbText } from './core';

// ---------------------------------------------------------------------------------------------------------
// Test registry
// ---------------------------------------------------------------------------------------------------------

export const TEST_MODULE_IDS = ['alpha', 'beta', 'gamma'] as const;
export type TestModuleId = (typeof TEST_MODULE_IDS)[number];

/** The App version the backup tests write into files. */
export const TEST_APP_VERSION = '1.0.0+test';

export const TestItemSchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  name: z.string().max(400),
  amount: z.number(),
  position: z.number().int().min(0),
  tags: z.array(z.string()),
  note: z.string().optional(),
  photoId: z.string().optional(),
});
export type TestItem = z.infer<typeof TestItemSchema>;

export const TestModuleDataSchema = z.strictObject({ items: z.array(TestItemSchema), images: z.array(BackupImageSchema) });
export type TestModuleData = z.infer<typeof TestModuleDataSchema>;

/** The tables of every test module, stored as `${id}_items` and `${id}_images`. */
export const TEST_MODULE_TABLES = { items: '&id, &idemKey, position', images: '&id' } as const;

/** `beta` is at data version 2: version 1 stored `entries` instead of `items`. */
export const TEST_DATA_VERSIONS: Readonly<Record<TestModuleId, number>> = { alpha: 1, beta: 2, gamma: 1 };

/** Migrates `beta` data from version 1 (`entries`) to version 2 (`items`); throws for any other shape. */
function betaV1ToV2(data: unknown): unknown {
  if (data === null || typeof data !== 'object' || !Array.isArray((data as { entries?: unknown }).entries)) {
    throw new Error('beta v1 data needs an entries array');
  }
  const { entries, ...rest } = data as { entries: unknown[] };
  return { items: entries, ...rest };
}

const noComponent = () => null;

const TEST_SETTINGS: Partial<Record<TestModuleId, BackupModule['settings']>> = {
  alpha: {
    schema: { level: z.number().int().min(0).max(10).describe('Accepted values: 0 to 10.') },
    defaults: { level: 5 },
    Section: noComponent,
  },
  beta: {
    schema: { label: z.string().max(200).describe('Accepted values: up to 200 characters.') },
    defaults: { label: '' },
    Section: noComponent,
  },
};

const sortById = <T extends { id: string }>(records: readonly T[]): T[] =>
  [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The database the test modules read and write; set by `withTestApp`. */
let currentDatabase: Dexie | null = null;

function database(): Dexie {
  if (currentDatabase === null) throw new Error('No test app database is open (use withTestApp)');
  return currentDatabase;
}

function testModule(id: TestModuleId): BackupModule {
  const itemsTable = moduleTableName(id, 'items');
  const imagesTable = moduleTableName(id, 'images');
  const dataVersion = TEST_DATA_VERSIONS[id];
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    tables: TEST_MODULE_TABLES,
    async exportData(): Promise<TestModuleData> {
      const d = database();
      return d.transaction('r', [itemsTable, imagesTable], async () => ({
        items: await d.table<TestItem, string>(itemsTable).toArray(),
        images: (await d.table<ImageRecord, string>(imagesTable).toArray()).map(imageToBackup),
      }));
    },
    async importData(data: unknown) {
      const d = database();
      const { items, images } = data as TestModuleData;
      await d.table(itemsTable).bulkAdd(items.map((item) => stripUndefined(item)));
      await d.table(imagesTable).bulkAdd(images.map(imageFromBackup));
    },
    backup: {
      dataVersion,
      schema: TestModuleDataSchema,
      migrations: dataVersion === 2 ? { 1: betaV1ToV2 } : {},
      sections: (data: unknown) => {
        const d = data as TestModuleData;
        return [
          { name: 'items', records: d.items },
          { name: 'images', records: d.images },
        ];
      },
    },
    ...(TEST_SETTINGS[id] === undefined ? {} : { settings: TEST_SETTINGS[id] }),
  };
}

/** The test registry: `alpha`, `beta` (data version 2) and `gamma`, in that order. */
export const TEST_MODULES: readonly BackupModule[] = TEST_MODULE_IDS.map(testModule);

/** Every store of the test app database: the test module tables and the core tables. */
export const TEST_STORES: Record<string, string> = buildStores(TEST_MODULES);

export interface TestApp {
  database: Dexie;
  modules: readonly BackupModule[];
}

/** Runs `fn` with a fresh, open test app database that `TEST_MODULES` read and write. */
export async function withTestApp<T>(fn: (app: TestApp) => Promise<T>): Promise<T> {
  return withTempDb(
    (name) => createDatabase(name, { initialStores: TEST_STORES, migrations: [], currentStores: TEST_STORES }),
    async (opened) => {
      const result = await openDatabase(opened);
      if (!result.ok) throw new Error(`Test app database could not be opened: ${result.reason}`);
      currentDatabase = opened;
      try {
        return await fn({ database: opened, modules: TEST_MODULES });
      } finally {
        currentDatabase = null;
      }
    },
  );
}

// ---------------------------------------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------------------------------------

export interface TestModuleState {
  items: TestItem[];
  images: ImageRecord[];
}

/** A full test database state: Profile (or none), settings, and every test module table. */
export interface AppState {
  profile: Profile | null;
  /** Unique keys, sorted by key. */
  settings: SettingRecord[];
  modules: Record<TestModuleId, TestModuleState>;
}

export const arbProfile: fc.Arbitrary<Profile> = fc.record({
  id: fc.constant(PROFILE_ID),
  age: fc.integer({ min: 13, max: 100 }),
  sex: fc.constantFrom(...SEXES),
  heightCm: fc.integer({ min: 100, max: 250 }),
  weightKg: fc.integer({ min: 300, max: 3000 }).map((tenths) => tenths / 10),
  weeklyTrainingHours: fc.integer({ min: 0, max: 80 }).map((halves) => halves / 2),
  goal: fc.constantFrom(...GOALS),
  updatedAt: arbEpoch,
});

const arbSettings: fc.Arbitrary<SettingRecord[]> = fc
  .record(
    {
      'core.backupReminderDays': fc.constantFrom<unknown>(...BACKUP_REMINDER_INTERVALS, 'off'),
      'alpha.level': fc.integer({ min: 0, max: 10 }),
      'beta.label': arbText(0, 20),
    },
    { requiredKeys: [] },
  )
  .map((values) =>
    Object.entries(values)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => (a.key < b.key ? -1 : 1)),
  );

/** A finite double at full precision; −0 is stored as 0 because JSON has no negative zero. */
export const arbAmount: fc.Arbitrary<number> = fc
  .double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true })
  .map((x) => (Object.is(x, -0) ? 0 : x));

export const arbItem: fc.Arbitrary<TestItem> = fc.record(
  {
    id: fc.uuid(),
    idemKey: fc.uuid(),
    name: arbText(0, 20),
    amount: arbAmount,
    position: fc.integer({ min: 0, max: 10_000 }),
    tags: fc.array(arbText(0, 6), { maxLength: 3 }),
    note: arbText(0, 10),
    photoId: fc.uuid(),
  },
  { requiredKeys: ['id', 'idemKey', 'name', 'amount', 'position', 'tags'] },
);

export const arbImageRecord: fc.Arbitrary<ImageRecord> = fc.record({
  id: fc.uuid(),
  mime: fc.constant('image/jpeg'),
  bytes: arbImageBytes.map((bytes) => bytes.slice().buffer),
  width: fc.integer({ min: 1, max: 4096 }),
  height: fc.integer({ min: 1, max: 4096 }),
});

const arbModuleState: fc.Arbitrary<TestModuleState> = fc.record({
  items: fc.uniqueArray(arbItem, { maxLength: 6, selector: (item) => item.id }).filter(
    (items) => new Set(items.map((item) => item.idemKey)).size === items.length,
  ),
  images: fc.uniqueArray(arbImageRecord, { maxLength: 3, selector: (image) => image.id }),
});

/** Profile (or none), settings, and every test module table (each may be empty), images included. */
export const arbAppState: fc.Arbitrary<AppState> = fc.record({
  profile: fc.option(arbProfile, { nil: null }),
  settings: arbSettings,
  modules: fc.record({ alpha: arbModuleState, beta: arbModuleState, gamma: arbModuleState }),
});

/** An accepted Gemini key: 1 to 60 characters without whitespace. */
export const arbGeminiKey: fc.Arbitrary<string> = fc.string({
  unit: fc.oneof(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'),
    fc.constantFrom('א', 'ש', 'é', '💪', '"', '\\', '.'),
  ),
  minLength: 1,
  maxLength: 60,
});

// ---------------------------------------------------------------------------------------------------------
// Backup files of a state
// ---------------------------------------------------------------------------------------------------------

/** The module data `exportData()` returns for a stored module state: records in primary-key order. */
export function moduleDataOf(state: TestModuleState): TestModuleData {
  return { items: sortById(state.items), images: sortById(state.images).map(imageToBackup) };
}

/** The Backup_File `buildBackup` produces for `state` (records in primary-key order, settings by key). */
export function backupFileOf(state: AppState, exportedAt: string, appVersion: string = TEST_APP_VERSION): BackupV1 {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    appVersion,
    exportedAt,
    core: { profile: state.profile, settings: state.settings.map((s) => ({ key: s.key, value: s.value })) },
    modules: TEST_MODULE_IDS.map((id) => ({ id, dataVersion: TEST_DATA_VERSIONS[id], data: moduleDataOf(state.modules[id]) })),
  };
}

export interface GeneratedBackup {
  state: AppState;
  file: BackupV1;
  /** `JSON.stringify(file)`. */
  text: string;
}

/** The serialised `buildBackup` output of an `arbAppState`. */
export const arbBackupFile: fc.Arbitrary<GeneratedBackup> = fc
  .record({ state: arbAppState, at: arbEpoch })
  .map(({ state, at }) => {
    const file = backupFileOf(state, toExportedAt(new Date(at)));
    return { state, file, text: JSON.stringify(file) };
  });

// ---------------------------------------------------------------------------------------------------------
// Seeding and reading a test app database
// ---------------------------------------------------------------------------------------------------------

const ALL_TABLES = Object.keys(TEST_STORES);

/** Writes `state` (and the Gemini key, when given) into an empty test app database. */
export async function seedAppState(database: Dexie, state: AppState, geminiKey?: string): Promise<void> {
  await database.transaction('rw', ALL_TABLES, async () => {
    if (state.profile !== null) await database.table(CORE_TABLES.profile).put(state.profile);
    await database.table(CORE_TABLES.settings).bulkPut(state.settings);
    for (const id of TEST_MODULE_IDS) {
      await database.table(moduleTableName(id, 'items')).bulkAdd(state.modules[id].items);
      await database.table(moduleTableName(id, 'images')).bulkAdd(state.modules[id].images);
    }
    if (geminiKey !== undefined) await database.table(CORE_TABLES.secrets).put({ key: SECRET_KEYS.geminiKey, value: geminiKey });
  });
}

/** Removes every record from every table of a test app database. */
export async function clearAppDb(database: Dexie): Promise<void> {
  await database.transaction('rw', ALL_TABLES, async () => {
    for (const name of ALL_TABLES) await database.table(name).clear();
  });
}

/** Comparable contents of a test app database: images with base64 bytes, records in primary-key order. */
export interface StoredState {
  profile: unknown;
  settings: unknown[];
  modules: Record<string, { items: unknown[]; images: Array<Omit<ImageRecord, 'bytes'> & { bytes: string }> }>;
  secrets: unknown[];
}

const comparableImage = (image: ImageRecord) => ({ ...image, bytes: toBase64(image.bytes) });
const comparableBackupImage = ({ base64, ...rest }: BackupImage) => ({ ...rest, bytes: base64 });

/** Reads every core and test module table (not `core_meta`). */
export async function dumpAppState(database: Dexie): Promise<StoredState> {
  return database.transaction('r', ALL_TABLES, async () => {
    const modules: StoredState['modules'] = {};
    for (const id of TEST_MODULE_IDS) {
      modules[id] = {
        items: await database.table(moduleTableName(id, 'items')).toArray(),
        images: (await database.table<ImageRecord, string>(moduleTableName(id, 'images')).toArray()).map(comparableImage),
      };
    }
    return {
      profile: (await database.table(CORE_TABLES.profile).get(PROFILE_ID)) ?? null,
      settings: await database.table(CORE_TABLES.settings).toArray(),
      modules,
      secrets: await database.table(CORE_TABLES.secrets).toArray(),
    };
  });
}

/** What `dumpAppState` reads after `state` (and the key) was seeded. */
export function storedStateOf(state: AppState, geminiKey?: string): StoredState {
  const modules: StoredState['modules'] = {};
  for (const id of TEST_MODULE_IDS) {
    modules[id] = { items: sortById(state.modules[id].items), images: sortById(state.modules[id].images).map(comparableImage) };
  }
  return {
    profile: state.profile,
    settings: [...state.settings],
    modules,
    secrets: geminiKey === undefined ? [] : [{ key: SECRET_KEYS.geminiKey, value: geminiKey }],
  };
}

/** The stored module tables of a validated test module entry. */
export function storedModuleOf(data: TestModuleData): StoredState['modules'][string] {
  return { items: sortById(data.items), images: sortById(data.images).map(comparableBackupImage) };
}
