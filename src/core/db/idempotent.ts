import type Dexie from 'dexie';
import { db } from './db';
import { hasErrorNamed } from './errorChain';
import { toDbWriteError } from './errors';
import { stripUndefined } from './strip';
import { write } from './write';

export interface Idempotent {
  idemKey: string;
}

export interface CreateResult<T> {
  /** The stored record: the one this call created, or the one created by the first operation with the key. */
  record: T;
  /** True only for the call that created the record. */
  created: boolean;
}

/** A create operation arrived without a non-empty string Idempotency_Key (R11.5). Nothing was written. */
export class MissingIdempotencyKeyError extends Error {
  override readonly name = 'MissingIdempotencyKeyError';

  constructor(readonly table: string) {
    super(`Create in ${table} rejected: the record has no idempotency key.`);
  }
}

/** Creates in progress, by database, table and Idempotency_Key. */
const inflight = new Map<string, Promise<CreateResult<unknown>>>();

function findByKey<T>(database: Dexie, table: string, idemKey: string): Promise<T | undefined> {
  return database.table<T>(table).where('idemKey').equals(idemKey).first();
}

/**
 * Creates `record` in `table` (which must declare a unique `&idemKey` index) at most once per
 * Idempotency_Key (R11.2):
 *
 * 1. A missing, empty or non-string `idemKey` rejects with `MissingIdempotencyKeyError`; nothing is written.
 * 2. A create with the same key still in flight gets that create's record (`created: false`).
 * 3. Otherwise one read-write transaction looks the key up and returns the stored record unchanged when it
 *    exists, or adds the record (with `undefined` fields stripped).
 * 4. A `ConstraintError` on the unique index (another window won the race) returns the stored record.
 * 5. Any other failure rejects with `DbWriteError` and leaves no record, so a retry with the same key creates
 *    it (R11.6).
 */
export function createIdempotent<T extends Idempotent & { id: string }>(
  table: string,
  record: T,
  database: Dexie = db,
): Promise<CreateResult<T>> {
  const idemKey: unknown = (record as { idemKey?: unknown } | null | undefined)?.idemKey;
  if (typeof idemKey !== 'string' || idemKey === '') {
    return Promise.reject(new MissingIdempotencyKeyError(table));
  }

  const flightKey = JSON.stringify([database.name, table, idemKey]);
  const running = inflight.get(flightKey) as Promise<CreateResult<T>> | undefined;
  if (running !== undefined) return running.then((result) => ({ record: result.record, created: false }));

  const run = async (): Promise<CreateResult<T>> => {
    try {
      return await write(
        [table],
        async () => {
          const existing = await findByKey<T>(database, table, idemKey);
          if (existing !== undefined) return { record: existing, created: false };
          const stored = stripUndefined(record);
          await database.table<T>(table).add(stored);
          return { record: stored, created: true };
        },
        database,
      );
    } catch (error) {
      if (hasErrorNamed(error, 'ConstraintError')) {
        let existing: T | undefined;
        try {
          existing = await findByKey<T>(database, table, idemKey);
        } catch (readError) {
          throw toDbWriteError(readError);
        }
        if (existing !== undefined) return { record: existing, created: false };
      }
      throw toDbWriteError(error);
    }
  };

  const promise = run().finally(() => {
    if (inflight.get(flightKey) === promise) inflight.delete(flightKey);
  });
  inflight.set(flightKey, promise);
  return promise;
}
