import type Dexie from 'dexie';
import { db } from '../db/db';
import { stripUndefined } from '../db/strip';
import { CORE_TABLES } from '../db/tables';
import { write } from '../db/write';
import { settingDefinition, validateSetting, type SettingResult } from './schema';

/** One `core_settings` record. */
export interface SettingRecord<T = unknown> {
  key: string;
  value: T;
}

function settingsTable(database: Dexie) {
  return database.table<SettingRecord, string>(CORE_TABLES.settings);
}

/**
 * The stored value of `fullKey`, or its default when the key is unset or the stored value is not accepted
 * by the key's schema. Throws `UnknownSettingError` for an undeclared key. Safe inside `liveQuery`.
 */
export async function readSetting<T>(fullKey: string, database: Dexie = db): Promise<T> {
  const def = settingDefinition(fullKey);
  const record = await settingsTable(database).get(fullKey);
  if (record !== undefined) {
    const parsed = def.schema.safeParse(record.value);
    if (parsed.success) return parsed.data as T;
  }
  return def.defaultValue as T;
}

/**
 * Validates `value` with the schema registered for `fullKey` and stores the schema's output (R5.5).
 * A rejected value writes nothing and returns the accepted-values text (R5.6). A failed write rejects with
 * `DbWriteError` and leaves the stored value unchanged (R3.5).
 */
export async function commitSetting(fullKey: string, value: unknown, database: Dexie = db): Promise<SettingResult> {
  const checked = validateSetting(fullKey, value);
  if (!checked.ok) return checked;
  const record: SettingRecord = stripUndefined({ key: fullKey, value: checked.value });
  await write([CORE_TABLES.settings], () => settingsTable(database).put(record), database);
  return { ok: true };
}
