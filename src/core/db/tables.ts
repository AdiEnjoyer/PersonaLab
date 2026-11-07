import type { ModuleDefinition } from '../registry/types';

/** Core table names (prefix `core_`). */
export const CORE_TABLES = {
  profile: 'core_profile',
  settings: 'core_settings',
  secrets: 'core_secrets',
  meta: 'core_meta',
} as const;

/** Core stores, database version 1. */
export const CORE_STORES: Readonly<Record<string, string>> = {
  [CORE_TABLES.profile]: '&id',
  [CORE_TABLES.settings]: '&key',
  [CORE_TABLES.secrets]: '&key',
  [CORE_TABLES.meta]: '&key',
};

/** Tables whose writes are not Owner data changes (R9.2): the Gemini key and app bookkeeping. */
export const UNTRACKED_TABLES: ReadonlySet<string> = new Set([CORE_TABLES.secrets, CORE_TABLES.meta]);

/** One `core_meta` record. */
export interface MetaRecord<T = unknown> {
  key: string;
  value: T;
}

/** Keys of the `core_meta` table. */
export const META_KEYS = {
  lastBackupAt: 'lastBackupAt',
  reminderSnoozeUntil: 'reminderSnoozeUntil',
  persistResult: 'persistResult',
  lastUpdateCheckAt: 'lastUpdateCheckAt',
  firstDataAt: 'firstDataAt',
  lastDataChangeAt: 'lastDataChangeAt',
  commandRecents: 'commandRecents',
} as const;

/** The Dexie store name of a module table: `${moduleId}_${short}` (R2.6). */
export function moduleTableName(moduleId: string, short: string): string {
  return `${moduleId}_${short}`;
}

/**
 * Every Dexie store: each module's tables as `${id}_${short}` in registry order, then the core stores.
 * Throws when two declarations produce the same store name, because Dexie would silently keep only one.
 */
export function buildStores(modules: readonly Pick<ModuleDefinition, 'id' | 'tables'>[]): Record<string, string> {
  const stores: Record<string, string> = {};
  const add = (name: string, spec: string) => {
    if (Object.hasOwn(stores, name)) throw new Error(`Duplicate database table name: ${name}`);
    stores[name] = spec;
  };
  for (const mod of modules) {
    for (const [short, spec] of Object.entries(mod.tables)) add(moduleTableName(mod.id, short), spec);
  }
  for (const [name, spec] of Object.entries(CORE_STORES)) add(name, spec);
  return stores;
}
