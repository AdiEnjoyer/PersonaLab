import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreTable, type Middleware } from 'dexie';
import { CORE_TABLES, META_KEYS, UNTRACKED_TABLES, type MetaRecord } from './tables';

export interface ChangeTracking {
  /** Resolves when every pending `core_meta` follow-up write has settled. */
  idle(): Promise<void>;
}

/** True when the request changes no record (an empty bulk write). */
function isEmptyMutation(req: DBCoreMutateRequest): boolean {
  switch (req.type) {
    case 'add':
      return req.values.length === 0;
    case 'put':
      return req.values.length === 0 && req.updates === undefined && req.criteria === undefined;
    case 'delete':
      return req.keys.length === 0 && req.criteria === undefined;
    case 'deleteRange':
      return false;
  }
}

/** The native IndexedDB transaction behind a DBCore transaction, when the backend is IndexedDB. */
function nativeTransaction(trans: unknown): IDBTransaction | null {
  if (trans !== null && typeof trans === 'object' && 'addEventListener' in trans && 'mode' in trans) {
    return trans as IDBTransaction;
  }
  return null;
}

/**
 * Installs a DBCore middleware on `database` that records Owner data changes for the backup reminder
 * (R9.2, R9.3). After a mutation of any table except `core_secrets` and `core_meta` succeeds and its
 * transaction commits, a follow-up transaction sets `core_meta.lastDataChangeAt = now` and, when absent,
 * `core_meta.firstDataAt = now`. Schema upgrades (the `versionchange` transaction) are not Owner changes.
 */
export function installChangeTracker(database: Dexie, now: () => number = Date.now): ChangeTracking {
  const pending = new Set<Promise<void>>();

  const recordChange = (at: number) => {
    const task = Dexie.ignoreTransaction(() =>
      database.transaction('rw', CORE_TABLES.meta, async () => {
        const meta = database.table<MetaRecord<number>, string>(CORE_TABLES.meta);
        const last = await meta.get(META_KEYS.lastDataChangeAt);
        if (last === undefined || last.value < at) await meta.put({ key: META_KEYS.lastDataChangeAt, value: at });
        if ((await meta.get(META_KEYS.firstDataAt)) === undefined) await meta.put({ key: META_KEYS.firstDataAt, value: at });
      }),
    ).then(
      () => undefined,
      // Bookkeeping only: a failed follow-up (e.g. the database was closed) must not surface as a write error.
      () => undefined,
    );
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };

  const middleware: Middleware<DBCore> = {
    stack: 'dbcore',
    name: 'changeTracker',
    create(down) {
      return {
        ...down,
        table(tableName: string): DBCoreTable {
          const table = down.table(tableName);
          if (UNTRACKED_TABLES.has(tableName)) return table;
          return {
            ...table,
            async mutate(req) {
              const res = await table.mutate(req);
              if (res.numFailures > 0 && res.numFailures >= ('values' in req ? req.values.length : 1)) return res;
              if (isEmptyMutation(req)) return res;
              const native = nativeTransaction(req.trans);
              if (native === null) {
                recordChange(now());
              } else if (native.mode !== 'versionchange') {
                native.addEventListener('complete', () => recordChange(now()), { once: true });
              }
              return res;
            },
          };
        },
      };
    },
  };

  database.use(middleware);

  return {
    async idle() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}
