import Dexie from 'dexie';
import { MODULES } from '../registry/modules';
import { installChangeTracker, type ChangeTracking } from './changeTracker';
import { errorText, hasErrorNamed } from './errorChain';
import { buildStores } from './tables';
import { assertMigrationOrder, declaredVersion, DB_VERSION, MIGRATIONS, type DbMigration } from './versions';

export const DB_NAME = 'personallab';

export interface SchemaConfig {
  /** The full store map of database version 1. */
  initialStores: Record<string, string>;
  /** Migrations to versions 2, 3, …, in order. */
  migrations: readonly DbMigration[];
  /** The full current store map; applied to the latest version so it always declares every table. */
  currentStores: Record<string, string>;
}

/**
 * Declares the version chain on `database`: version 1 with its full store map, one Dexie version per
 * migration (store delta + content upgrade), and the full current store map on the latest version.
 * Dexie runs every upgrade from the stored version + 1 up to the latest in one `versionchange`
 * transaction, which IndexedDB commits all-or-nothing (R3.3, R3.4).
 */
export function declareVersions(database: Dexie, config: SchemaConfig): void {
  assertMigrationOrder(config.migrations);
  database.version(1).stores(config.initialStores);
  for (const migration of config.migrations) {
    const version = database.version(migration.version).stores(migration.stores ?? {});
    const upgrade = migration.upgrade;
    if (upgrade !== undefined) version.upgrade((tx) => upgrade(tx));
  }
  database.version(declaredVersion(config.migrations)).stores(config.currentStores);
}

/** Creates a Dexie instance with the version chain declared. Nothing is opened. */
export function createDatabase(name: string, config: SchemaConfig): Dexie {
  const database = new Dexie(name);
  declareVersions(database, config);
  return database;
}

const appStores = buildStores(MODULES);

if (declaredVersion(MIGRATIONS) !== DB_VERSION) {
  throw new Error(`DB_VERSION is ${DB_VERSION} but the migrations declare version ${declaredVersion(MIGRATIONS)}`);
}

/** THE Local_Database. */
export const db: Dexie = createDatabase(DB_NAME, {
  initialStores: appStores,
  migrations: MIGRATIONS,
  currentStores: appStores,
});

/** Data-change tracking of `db` for the backup reminder. */
export const changeTracking: ChangeTracking = installChangeTracker(db);

export type OpenResult =
  | { ok: true }
  /** The stored schema version is newer than this App declares (R3.7). Nothing was changed. */
  | { ok: false; reason: 'newer-version'; storedVersion: number }
  /** An upgrade threw or was aborted; the database stays at `storedVersion` with every record (R3.4). */
  | { ok: false; reason: 'migration-failed'; storedVersion: number; error: string }
  /** Any other open failure, e.g. private mode or storage disabled (R3.6). */
  | { ok: false; reason: 'unavailable'; error: string };

/** The IDBFactory `database` uses. */
function factoryOf(database: Dexie): IDBFactory | undefined {
  return (database._options.indexedDB as IDBFactory | undefined) ?? Dexie.dependencies.indexedDB ?? undefined;
}

/** Dexie stores version `v` as native IndexedDB version `v * 10` (+1 after a schema patch). */
function toSchemaVersion(nativeVersion: number): number {
  return Math.floor(nativeVersion / 10);
}

/**
 * The stored schema version of `name`, or 0 when the database does not exist. Reads the version without
 * opening a connection when `indexedDB.databases()` exists; otherwise opens the database dynamically
 * (no version requested, so nothing is upgraded or created).
 */
async function readStoredVersion(name: string, factory: IDBFactory): Promise<number> {
  if (typeof factory.databases === 'function') {
    const list = await factory.databases();
    const info = list.find((d) => d.name === name);
    return info?.version === undefined ? 0 : toSchemaVersion(info.version);
  }
  const probe = new Dexie(name, { indexedDB: factory, autoOpen: false });
  try {
    await probe.open();
    return toSchemaVersion(probe.backendDB().version);
  } catch (error) {
    if (hasErrorNamed(error, 'NoSuchDatabaseError')) return 0;
    throw error;
  } finally {
    probe.close();
  }
}

/**
 * Opens `database` (the App's `db` by default) and classifies failures. Dexie 4 silently opens a database
 * whose stored version is newer than the declared one (and may even patch its schema), so the stored version
 * is checked first and a newer database is never opened, which leaves it unchanged (R3.7).
 */
export async function openDatabase(database: Dexie = db): Promise<OpenResult> {
  const factory = factoryOf(database);
  if (factory === undefined) return { ok: false, reason: 'unavailable', error: 'IndexedDB is not available' };

  let storedVersion: number;
  try {
    storedVersion = await readStoredVersion(database.name, factory);
  } catch (error) {
    return { ok: false, reason: 'unavailable', error: errorText(error) };
  }

  const declared = database.verno;
  if (storedVersion > declared) return { ok: false, reason: 'newer-version', storedVersion };

  try {
    await database.open();
    return { ok: true };
  } catch (error) {
    if (hasErrorNamed(error, 'VersionError')) {
      return { ok: false, reason: 'newer-version', storedVersion: await readStoredVersion(database.name, factory).catch(() => storedVersion) };
    }
    const upgrading = storedVersion > 0 && storedVersion < declared;
    if (upgrading || hasErrorNamed(error, 'UpgradeError')) {
      return { ok: false, reason: 'migration-failed', storedVersion, error: errorText(error) };
    }
    return { ok: false, reason: 'unavailable', error: errorText(error) };
  }
}
