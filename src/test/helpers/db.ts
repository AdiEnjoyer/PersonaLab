import Dexie from 'dexie';
import { changeTracking, db, openDatabase } from '../../core/db/db';

let counter = 0;

/** A database name no other test run uses. */
export function uniqueDbName(prefix = 'test'): string {
  counter += 1;
  return `${prefix}-${counter}-${crypto.randomUUID()}`;
}

/**
 * Runs `fn` against an empty App database (`db`): waits for pending change-tracking writes of the previous
 * run, deletes the database and opens it again at the declared version. Use it at the start of every
 * database-backed test or property run.
 */
export async function withFreshDb<T>(fn: (database: Dexie) => Promise<T>): Promise<T> {
  await changeTracking.idle();
  db.close({ disableAutoOpen: false });
  await Dexie.delete(db.name);
  const result = await openDatabase(db);
  if (!result.ok) throw new Error(`Test database could not be opened: ${result.reason}`);
  return fn(db);
}

/** Runs `fn` with a uniquely named Dexie instance from `create`, then closes and deletes it. */
export async function withTempDb<T>(create: (name: string) => Dexie, fn: (database: Dexie) => Promise<T>): Promise<T> {
  const name = uniqueDbName();
  const database = create(name);
  try {
    return await fn(database);
  } finally {
    database.close();
    await Dexie.delete(name);
  }
}
