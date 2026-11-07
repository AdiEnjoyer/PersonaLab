import type Dexie from 'dexie';
import { db } from '../db/db';
import { CORE_TABLES, META_KEYS, type MetaRecord } from '../db/tables';
import { write } from '../db/write';

export interface PersistResult {
  granted: boolean;
  at: number;
}
export type PersistStatus = 'granted' | 'denied' | 'unsupported' | 'unknown';

const meta = (database: Dexie) => database.table<MetaRecord<PersistResult>, string>(CORE_TABLES.meta);

/**
 * Asks the browser for persistent storage once and records the answer. Never throws and is meant to be
 * called without awaiting. A recorded result is not asked for again.
 */
export async function requestPersistOnce(database: Dexie = db): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return;
    if ((await meta(database).get(META_KEYS.persistResult)) !== undefined) return;
    const granted = await navigator.storage.persist();
    const record: MetaRecord<PersistResult> = { key: META_KEYS.persistResult, value: { granted, at: Date.now() } };
    await write([CORE_TABLES.meta], () => meta(database).put(record), database);
  } catch {
    /* persistence is best effort */
  }
}

/** The recorded persistence result, or the live browser state when none was recorded yet. */
export async function getPersistStatus(database: Dexie = db): Promise<PersistStatus> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return 'unsupported';
  try {
    if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) return 'granted';
    const stored = await meta(database).get(META_KEYS.persistResult);
    if (stored === undefined) return 'unknown';
    return stored.value.granted ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}