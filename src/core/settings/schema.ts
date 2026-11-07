import { z, type ZodType } from 'zod';
import { MODULES } from '../registry/modules';
import type { ModuleDefinition } from '../registry/types';

/** The owner prefix of core settings keys (`core.${key}`). */
export const CORE_OWNER = 'core';

/** Full `core_settings` keys of the core settings. */
export const CORE_SETTING_KEYS = {
  backupReminderDays: 'core.backupReminderDays',
} as const;

/** The reminder intervals in days; `'off'` disables the reminder (R9.1). */
export const BACKUP_REMINDER_INTERVALS = [3, 7, 14, 30] as const;
export type BackupReminderDays = (typeof BACKUP_REMINDER_INTERVALS)[number] | 'off';

/** Backup reminder interval: 3, 7, 14 or 30 days, or off (R5.2, R9.1). */
export const backupReminderDaysSchema: ZodType<BackupReminderDays> = z
  .union([z.literal(3), z.literal(7), z.literal(14), z.literal(30), z.literal('off')])
  .describe('Accepted values: 3, 7, 14 or 30 days, or off.');

/** Core settings, declared like a module's `settings` (keys without the `core.` prefix). */
export const CORE_SETTINGS: { schema: Record<string, ZodType>; defaults: Record<string, unknown> } = {
  schema: { backupReminderDays: backupReminderDaysSchema },
  defaults: { backupReminderDays: 7 satisfies BackupReminderDays },
};

/** Outcome of committing a setting. On failure `error` is the accepted-values text for the field (R5.6). */
export type SettingResult = { ok: true } | { ok: false; error: string };

export interface SettingDefinition {
  /** Full key, `${owner}.${key}`. */
  key: string;
  /** `core` or the declaring module id. */
  owner: string;
  schema: ZodType;
  /** Deep-frozen default value; an unset key reads this. */
  defaultValue: unknown;
  /** Shown next to the field when a value is rejected (R5.6). */
  acceptedValues: string;
}

/** A key that no settings schema declares. Reading or committing one is a programming error. */
export class UnknownSettingError extends Error {
  override readonly name = 'UnknownSettingError';
  constructor(readonly key: string) {
    super(`Unknown setting: ${key}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const field of Object.values(value)) deepFreeze(field);
    Object.freeze(value);
  }
  return value;
}

/**
 * The schema registry: the core settings followed by every module's `settings.schema`, in registry order,
 * keyed by full key. Throws when a declaration is inconsistent (a schema without a default or the other way
 * round, a default the schema rejects, a schema without accepted-values text, or a duplicate key), because
 * each of these would break R5.5 or R5.6 at run time.
 */
export function buildSettingsRegistry(
  modules: readonly Pick<ModuleDefinition, 'id' | 'settings'>[],
): ReadonlyMap<string, SettingDefinition> {
  const registry = new Map<string, SettingDefinition>();
  const declare = (owner: string, schemas: Record<string, ZodType>, defaults: Record<string, unknown>) => {
    for (const key of Object.keys(defaults)) {
      if (!Object.hasOwn(schemas, key)) throw new Error(`Setting ${owner}.${key} has a default but no schema`);
    }
    for (const [key, schema] of Object.entries(schemas)) {
      const fullKey = `${owner}.${key}`;
      if (registry.has(fullKey)) throw new Error(`Duplicate setting key: ${fullKey}`);
      if (!Object.hasOwn(defaults, key)) throw new Error(`Setting ${fullKey} has no default`);
      const parsed = schema.safeParse(defaults[key]);
      if (!parsed.success) throw new Error(`The default of setting ${fullKey} is not accepted by its schema`);
      const acceptedValues = schema.description;
      if (acceptedValues === undefined || acceptedValues === '') {
        throw new Error(`Setting ${fullKey} has no accepted-values text (use .describe())`);
      }
      registry.set(fullKey, { key: fullKey, owner, schema, defaultValue: deepFreeze(structuredClone(parsed.data)), acceptedValues });
    }
  };
  declare(CORE_OWNER, CORE_SETTINGS.schema, CORE_SETTINGS.defaults);
  for (const mod of modules) {
    if (mod.settings !== undefined) declare(mod.id, mod.settings.schema, mod.settings.defaults);
  }
  return registry;
}

let appRegistry: ReadonlyMap<string, SettingDefinition> | undefined;

/** The schema registry of the App (core settings plus `MODULES`), built on first use. */
export function settingsRegistry(): ReadonlyMap<string, SettingDefinition> {
  appRegistry ??= buildSettingsRegistry(MODULES);
  return appRegistry;
}

/** The definition of `fullKey`; throws `UnknownSettingError` when no schema declares it. */
export function settingDefinition(fullKey: string): SettingDefinition {
  const def = settingsRegistry().get(fullKey);
  if (def === undefined) throw new UnknownSettingError(fullKey);
  return def;
}

export type SettingValidation = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Checks `value` against the schema registered for `fullKey`. On success `value` is the schema's output
 * (for example a trimmed username), which is what gets stored.
 */
export function validateSetting(fullKey: string, value: unknown): SettingValidation {
  const def = settingDefinition(fullKey);
  const parsed = def.schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: def.acceptedValues };
}
