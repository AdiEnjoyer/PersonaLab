import Dexie, { type DBCoreMutateRequest } from 'dexie';
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

export interface WriteFailures {
  /** Makes the next `count` mutations of `table` fail with `error()`. */
  failNext(table: string, error: () => unknown, count?: number): void;
  /** Makes every mutation for which `predicate` returns true fail with `error()`, until `clear()`. */
  failWhen(predicate: (table: string, req: DBCoreMutateRequest) => boolean, error: () => unknown): void;
  clear(): void;
}

/** Installs a DBCore middleware on `database` that fails chosen mutations, for injected-failure tests. */
export function installWriteFailures(database: Dexie): WriteFailures {
  const counts = new Map<string, { remaining: number; error: () => unknown }>();
  let rule: { predicate: (table: string, req: DBCoreMutateRequest) => boolean; error: () => unknown } | null = null;
  database.use({
    stack: 'dbcore',
    name: 'testWriteFailures',
    create(down) {
      return {
        ...down,
        table(tableName: string) {
          const table = down.table(tableName);
          return {
            ...table,
            mutate(req: DBCoreMutateRequest) {
              const once = counts.get(tableName);
              if (once !== undefined && once.remaining > 0) {
                once.remaining -= 1;
                return Promise.reject(once.error());
              }
              if (rule !== null && rule.predicate(tableName, req)) return Promise.reject(rule.error());
              return table.mutate(req);
            },
          };
        },
      };
    },
  });
  return {
    failNext(table, error, count = 1) {
      counts.set(table, { remaining: count, error });
    },
    failWhen(predicate, error) {
      rule = { predicate, error };
    },
    clear() {
      counts.clear();
      rule = null;
    },
  };
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
