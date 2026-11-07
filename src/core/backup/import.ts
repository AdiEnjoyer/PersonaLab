import type { z } from 'zod';
import { ProfileSchema, type Profile } from '../profile/schema';
import { MODULES } from '../registry/modules';
import { buildSettingsRegistry, CORE_OWNER, type SettingDefinition } from '../settings/schema';
import { CORE_SECTION, SUPPORTED_SCHEMA_VERSION } from './format';
import { IMPORT_MESSAGES } from './messages';
import { ENVELOPE_MIGRATIONS, migrateEnvelope, migrateModuleEntry, type EnvelopeMigration } from './migrations';
import { BackupEnvelope, BackupModuleEntry, BackupV1Header, type BackupV1 } from './schema';
import type { BackupModule } from './types';

/** The R7.1 check that rejected a file. Header structure failures are reported with the envelope message. */
export type ImportStage = 'read' | 'json' | 'envelope' | 'version' | 'migration' | 'record';

export interface ImportPlan {
  /**
   * The migrated, validated file as it will be imported: the core Profile and the settings of core and
   * registered modules (schema outputs), and the entries of registered modules at their current data version
   * with their validated data. Entries and settings of unregistered modules are left out (R7.7).
   */
  file: BackupV1;
  exportedAt: string;
  /** Registered modules present in the file, in registry order, with their record counts (R7.8). */
  present: Array<{ id: string; name: string; recordCount: number }>;
  /** Names of registered modules absent from the file, in registry order; their data stays unchanged (R7.8). */
  absent: string[];
  /** Module ids in the file that are not registered, in file order (R7.7). */
  skipped: string[];
}

export type ImportCheck =
  | { ok: true; plan: ImportPlan }
  | {
      ok: false;
      stage: ImportStage;
      /** The exact R7 message. */
      message: string;
      /** For `record` failures: the section (core data or the module id), 1-based position and field path. */
      section?: string;
      position?: number;
      field?: string;
    };

type Failure = Extract<ImportCheck, { ok: false }>;

export interface ValidateOptions {
  /** Envelope migrations by source Schema_Version; `ENVELOPE_MIGRATIONS` by default. */
  envelopeMigrations?: Readonly<Record<number, EnvelopeMigration>>;
}

/** The field text used when the whole record (not one of its fields) is invalid. */
const WHOLE_RECORD = '(whole record)';

const SETTING_KEY = /^([a-z][a-z0-9]{0,19})\.(.+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(stage: ImportStage, message: string): Failure {
  return { ok: false, stage, message };
}

function invalidRecord(section: string, position: number, path: readonly PropertyKey[]): Failure {
  const field = formatPath(path);
  return { ok: false, stage: 'record', message: IMPORT_MESSAGES.invalidRecord(section, position, field), section, position, field };
}

/** `['entries', 0, 'sets', 1, 'weight']` → `entries[0].sets[1].weight`; an empty path is the whole record. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out === '' ? String(part) : `.${String(part)}`;
  }
  return out === '' ? WHOLE_RECORD : out;
}

/** The issue's path, extended by the first unknown key for an `unrecognized_keys` issue. */
function issuePath(issue: z.core.$ZodIssue): PropertyKey[] {
  const path: PropertyKey[] = [...issue.path];
  if (issue.code === 'unrecognized_keys' && issue.keys.length > 0) path.push(issue.keys[0]!);
  return path;
}

const registries = new WeakMap<readonly BackupModule[], ReadonlyMap<string, SettingDefinition>>();

function settingsRegistryOf(modules: readonly BackupModule[]): ReadonlyMap<string, SettingDefinition> {
  let registry = registries.get(modules);
  if (registry === undefined) {
    registry = buildSettingsRegistry(modules);
    registries.set(modules, registry);
  }
  return registry;
}

type Sections = Array<{ name: string; records: unknown[] }>;

/** `sections(data)` of a module for unvalidated data: a throw or a non-array section yields no records. */
function safeSections(mod: BackupModule, data: unknown): Sections {
  try {
    const sections = mod.backup.sections(data);
    return Array.isArray(sections) ? sections.filter((s) => isRecord(s) && Array.isArray(s.records)) : [];
  } catch {
    return [];
  }
}

/** The total number of records in a module's data (R7.8). */
function recordCount(mod: BackupModule, data: unknown): number {
  return safeSections(mod, data).reduce((sum, section) => sum + section.records.length, 0);
}

/**
 * The 1-based position (within the concatenated `sections(data)`) and the field path inside that record of
 * the value at `path`, or `null` when the path does not lead through a record.
 */
function locateRecord(
  data: unknown,
  path: readonly PropertyKey[],
  arrays: ReadonlyMap<unknown, number>,
  records: ReadonlyMap<unknown, number>,
): { position: number; field: PropertyKey[] } | null {
  let node: unknown = data;
  for (let i = 0; i <= path.length; i++) {
    if (node !== null && typeof node === 'object' && records.has(node)) return { position: records.get(node)!, field: path.slice(i) };
    if (i === path.length) break;
    const key = path[i]!;
    if (Array.isArray(node) && arrays.has(node) && typeof key === 'number') {
      return { position: arrays.get(node)! + key + 1, field: path.slice(i + 1) };
    }
    node = node !== null && typeof node === 'object' ? (node as Record<PropertyKey, unknown>)[key] : undefined;
  }
  return null;
}

/**
 * The R7.5 failure for module data that its schema rejected: the first invalid record in section order and
 * array order, and the first issue's field inside it. Issues outside every record (for example a missing
 * section array) are reported as record 1 with the path inside the module data.
 */
function moduleRecordFailure(mod: BackupModule, data: unknown, issues: readonly z.core.$ZodIssue[]): Failure {
  const arrays = new Map<unknown, number>();
  const records = new Map<unknown, number>();
  let offset = 0;
  for (const section of safeSections(mod, data)) {
    if (!arrays.has(section.records)) arrays.set(section.records, offset);
    section.records.forEach((record, i) => {
      if (record !== null && typeof record === 'object' && !records.has(record)) records.set(record, offset + i + 1);
    });
    offset += section.records.length;
  }

  let best: { position: number; field: PropertyKey[] } | null = null;
  for (const issue of issues) {
    const located = locateRecord(data, issuePath(issue), arrays, records);
    if (located !== null && (best === null || located.position < best.position)) best = located;
  }
  if (best !== null) return invalidRecord(mod.id, best.position, best.field);
  return invalidRecord(mod.id, 1, issues.length > 0 ? issuePath(issues[0]!) : []);
}

/**
 * Checks a parsed Backup_File value in the R7.1 order and stops at the first failure: envelope (R7.3),
 * Schema_Version and module data version support (R7.4), migration (R7.6, R7.13), then records (R7.5) in file
 * order: the core Profile (record 1 when present), the core settings in file order (each against the schema
 * registered for its key), then the entries of registered modules in file order against
 * `module.backup.schema`, with positions taken from `module.backup.sections()`. Entries and settings of
 * unregistered modules are skipped unvalidated (R7.7). Pure: nothing is read or written.
 */
export function validateBackupValue(
  parsed: unknown,
  modules: readonly BackupModule[] = MODULES,
  options: ValidateOptions = {},
): ImportCheck {
  // Envelope (R7.3)
  const envelope = BackupEnvelope.safeParse(parsed);
  if (!envelope.success || !isRecord(parsed)) return fail('envelope', IMPORT_MESSAGES.notBackup);
  const fileVersion = envelope.data.schemaVersion;

  // Version support (R7.4): the file, then each registered module entry in file order.
  if (fileVersion > SUPPORTED_SCHEMA_VERSION) {
    return fail('version', IMPORT_MESSAGES.newerFile(fileVersion, SUPPORTED_SCHEMA_VERSION));
  }
  const byId = new Map(modules.map((m) => [m.id, m]));
  if (Array.isArray(parsed.modules)) {
    for (const entry of parsed.modules) {
      if (!isRecord(entry) || typeof entry.id !== 'string') continue;
      const mod = byId.get(entry.id);
      if (mod === undefined || typeof entry.dataVersion !== 'number') continue;
      if (entry.dataVersion > mod.backup.dataVersion) {
        return fail('version', IMPORT_MESSAGES.newerModule(entry.dataVersion, mod.backup.dataVersion, mod.id));
      }
    }
  }

  // Migration (R7.6, R7.13): the envelope one version at a time, then each registered module entry.
  let migrated: Record<string, unknown>;
  try {
    migrated = migrateEnvelope({ ...parsed, schemaVersion: fileVersion }, options.envelopeMigrations ?? ENVELOPE_MIGRATIONS);
  } catch {
    return fail('migration', IMPORT_MESSAGES.migrationFailed(fileVersion));
  }
  const header = BackupV1Header.safeParse(migrated);
  if (!header.success || !isRecord(migrated.core) || !Object.hasOwn(migrated.core, 'profile')) {
    return fail('envelope', IMPORT_MESSAGES.notBackup);
  }

  const skipped: string[] = [];
  const skip = (id: string) => {
    if (!skipped.includes(id)) skipped.push(id);
  };
  const entries: Array<{ mod: BackupModule; data: unknown }> = [];
  for (const raw of header.data.modules) {
    const mod = byId.get(raw.id);
    if (mod === undefined) {
      skip(raw.id);
      continue;
    }
    const entry = BackupModuleEntry.safeParse(raw);
    if (!entry.success || entries.some((e) => e.mod.id === mod.id)) return fail('envelope', IMPORT_MESSAGES.notBackup);
    try {
      entries.push({ mod, data: migrateModuleEntry(mod.id, entry.data.data, entry.data.dataVersion, mod.backup) });
    } catch {
      return fail('migration', IMPORT_MESSAGES.migrationFailed(fileVersion));
    }
  }

  // Records (R7.5): core data first.
  const rawProfile = header.data.core.profile;
  let profile: Profile | null = null;
  let position = 0;
  if (rawProfile !== null) {
    position = 1;
    const checked = ProfileSchema.safeParse(rawProfile);
    if (!checked.success) return invalidRecord(CORE_SECTION, 1, issuePath(checked.error.issues[0]!));
    profile = checked.data;
  }

  const registry = settingsRegistryOf(modules);
  const settings: BackupV1['core']['settings'] = [];
  const seenKeys = new Set<string>();
  for (const record of header.data.core.settings) {
    position += 1;
    const match = SETTING_KEY.exec(record.key);
    if (match === null || seenKeys.has(record.key)) return invalidRecord(CORE_SECTION, position, ['key']);
    seenKeys.add(record.key);
    const owner = match[1]!;
    if (owner !== CORE_OWNER && !byId.has(owner)) {
      skip(owner);
      continue;
    }
    const def = registry.get(record.key);
    if (def === undefined) return invalidRecord(CORE_SECTION, position, ['key']);
    const checked = def.schema.safeParse(record.value);
    if (!checked.success) return invalidRecord(CORE_SECTION, position, ['value', ...issuePath(checked.error.issues[0]!)]);
    settings.push({ key: record.key, value: checked.data });
  }

  // Then module entries in file order.
  const validated: BackupV1['modules'] = [];
  const counts = new Map<string, number>();
  for (const { mod, data } of entries) {
    const checked = mod.backup.schema.safeParse(data);
    if (!checked.success) return moduleRecordFailure(mod, data, checked.error.issues);
    validated.push({ id: mod.id, dataVersion: mod.backup.dataVersion, data: checked.data });
    counts.set(mod.id, recordCount(mod, checked.data));
  }

  const { format, appVersion, exportedAt } = header.data;
  const file: BackupV1 = { format, schemaVersion: SUPPORTED_SCHEMA_VERSION, appVersion, exportedAt, core: { profile, settings }, modules: validated };
  return {
    ok: true,
    plan: {
      file,
      exportedAt,
      present: modules.filter((m) => counts.has(m.id)).map((m) => ({ id: m.id, name: m.name, recordCount: counts.get(m.id)! })),
      absent: modules.filter((m) => !counts.has(m.id)).map((m) => m.name),
      skipped,
    },
  };
}

/** Reads a file as UTF-8 text; uses `FileReader` where `Blob.text()` is missing. */
function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Reads and checks a selected Backup_File before anything is changed (R7.1): a read failure (R7.14), an empty
 * file or invalid JSON (R7.2), then `validateBackupValue`. Reads nothing from and writes nothing to the
 * Local_Database.
 */
export async function checkBackupFile(file: Blob, modules: readonly BackupModule[] = MODULES): Promise<ImportCheck> {
  let text: string;
  try {
    text = await readText(file);
  } catch {
    return fail('read', IMPORT_MESSAGES.unreadable);
  }
  if (file.size === 0 || text === '') return fail('json', IMPORT_MESSAGES.notJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('json', IMPORT_MESSAGES.notJson);
  }
  return validateBackupValue(parsed, modules);
}
