import type Dexie from 'dexie';
import { db } from './db';
import { toDbWriteError } from './errors';

/**
 * Runs `fn` in one read-write transaction over `tables` and maps any failure to a `DbWriteError`.
 * The transaction is atomic: when it fails, every record it touched keeps its stored state (R3.5).
 * Inside an enclosing transaction that covers `tables`, Dexie reuses that transaction.
 */
export async function write<T>(tables: readonly string[], fn: () => Promise<T>, database: Dexie = db): Promise<T> {
  try {
    return await database.transaction('rw', tables, fn);
  } catch (error) {
    throw toDbWriteError(error);
  }
}
