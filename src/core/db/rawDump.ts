import Dexie, { type Table } from 'dexie';
import { isBinary, toBase64 } from '../backup/base64';
import { backupFileName } from '../backup/filename';
import { BACKUP_APP_VERSION, BACKUP_FORMAT, BACKUP_MIME_TYPE, SUPPORTED_SCHEMA_VERSION, toExportedAt } from '../backup/format';
import type { BackupV1 } from '../backup/schema';
import { MODULES } from '../registry/modules';
import { DB_NAME } from './db';
import { CORE_TABLES } from './tables';
import { MIGRATIONS, MODULE_DATA_VERSIONS_V1, type DbMigration } from './versions';

export interface EmergencyExportOptions {
  /** Database name; the App's `personallab` by default. */
  name?: string;
  /** Export time for the timestamp and file name. */
  now?: Date;
  appVersion?: string;
  /** Declared migrations, for the module data versions of stored versions above 1. */
  migrations?: readonly DbMigration[];
  /** Module order for the entries; registry order by default, other table prefixes follow by name. */
  moduleOrder?: readonly string[];
}

/** The module data versions recorded for database version `version` (R3.4). */
export function moduleDataVersionsFor(version: number, migrations: readonly DbMigration[] = MIGRATIONS): Record<string, number> {
  if (version <= 1) return MODULE_DATA_VERSIONS_V1;
  const migration = migrations.find((m) => m.version === version);
  if (migration === undefined) throw new Error(`No module data versions are recorded for database version ${version}`);
  return migration.moduleDataVersions;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A JSON-safe copy of a stored record: binary values become base64 strings, and an image's `bytes` field
 * becomes `base64`, the Backup_File image form (R6.2).
 */
function jsonSafe(value: unknown): unknown {
  if (isBinary(value)) return toBase64(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === 'bytes' && isBinary(field)) out.base64 = toBase64(field);
    else out[key] = jsonSafe(field);
  }
  return out;
}

/** Every record of `table` in primary-key order; outbound-key records are written as `{ key, value }`. */
async function readTable(table: Table): Promise<unknown[]> {
  const keyPath = table.schema.primKey.keyPath;
  const outbound = keyPath === undefined || keyPath === null || keyPath === '';
  const records: unknown[] = [];
  await table.toCollection().each((record: unknown, cursor) => {
    records.push(outbound ? { key: jsonSafe(cursor.primaryKey), value: jsonSafe(record) } : jsonSafe(record));
  });
  return records;
}

const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * The emergency export offered on the migration-failure screen (R3.4). Opens the database in dynamic mode
 * (no version declared, so it opens at the stored version and nothing is upgraded), reads every table and
 * builds a Backup_File holding every record: the Profile and settings as core data, and one entry per table
 * prefix with the module data version recorded for the stored version and `data = { [short]: records }`.
 * Secrets (R6.3) and App bookkeeping (`core_meta`) are not exported. Writes nothing.
 */
export async function emergencyExport(options: EmergencyExportOptions = {}): Promise<File> {
  const now = options.now ?? new Date();
  const raw = new Dexie(options.name ?? DB_NAME);
  await raw.open();
  try {
    const versions = moduleDataVersionsFor(raw.verno, options.migrations ?? MIGRATIONS);
    const tables = raw.tables.map((t) => t.name);

    const dump = await raw.transaction('r', tables, async () => {
      const out = new Map<string, unknown[]>();
      for (const name of tables) out.set(name, await readTable(raw.table(name)));
      return out;
    });

    const profiles = dump.get(CORE_TABLES.profile) ?? [];
    const settings = (dump.get(CORE_TABLES.settings) ?? []) as Array<{ key: string; value: unknown }>;

    const groups = new Map<string, Record<string, unknown[]>>();
    for (const [name, records] of dump) {
      if (name.startsWith('core_')) continue;
      const split = name.indexOf('_');
      const id = split > 0 ? name.slice(0, split) : name;
      const short = split > 0 ? name.slice(split + 1) : name;
      const data = groups.get(id) ?? {};
      data[short] = records;
      groups.set(id, data);
    }
    for (const id of Object.keys(versions)) if (!groups.has(id)) groups.set(id, {});

    const order = options.moduleOrder ?? MODULES.map((m) => m.id);
    const ids = [...groups.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== ib) return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
      return a < b ? -1 : a > b ? 1 : 0;
    });

    const file: BackupV1 = {
      format: BACKUP_FORMAT,
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      appVersion: options.appVersion ?? BACKUP_APP_VERSION,
      exportedAt: toExportedAt(now),
      core: {
        profile: (profiles[0] ?? null) as BackupV1['core']['profile'],
        settings: settings.map((s) => ({ key: s.key, value: s.value })).sort(byKey),
      },
      modules: ids.map((id) => ({ id, dataVersion: versions[id] ?? 1, data: groups.get(id)! })),
    };
    return new File([JSON.stringify(file)], backupFileName(now), { type: BACKUP_MIME_TYPE });
  } finally {
    raw.close();
  }
}
