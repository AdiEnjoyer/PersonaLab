import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { DbWriteError, isQuotaError, toDbWriteError } from '../errors';
import { createDatabase, openDatabase } from '../db';
import { write } from '../write';
import { installWriteFailures, uniqueDbName, type WriteFailures } from '../../../test/helpers/db';

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

describe('toDbWriteError', () => {
  it('detects a quota error itself, behind Dexie inner errors, causes and bulk failures', () => {
    expect(toDbWriteError(quota()).quota).toBe(true);
    expect(toDbWriteError(new Dexie.AbortError('aborted', quota())).quota).toBe(true);
    expect(toDbWriteError(new Error('outer', { cause: new Error('mid', { cause: quota() }) })).quota).toBe(true);
    expect(toDbWriteError(new Dexie.BulkError('bulk', { 0: new Error('x'), 3: quota() })).quota).toBe(true);
    expect(toDbWriteError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }).quota).toBe(true);
  });

  it('is not a quota error otherwise', () => {
    for (const e of [new Error('x'), new Dexie.ConstraintError('dup'), 'text', null, undefined, { name: 42 }]) {
      expect(isQuotaError(e)).toBe(false);
      expect(toDbWriteError(e).quota).toBe(false);
    }
  });

  it('keeps the cause, gives a fixed short reason and passes DbWriteError through', () => {
    const cause = new Dexie.ConstraintError('Key already exists in the object store.');
    const error = toDbWriteError(cause);
    expect(error).toBeInstanceOf(DbWriteError);
    expect(error.name).toBe('DbWriteError');
    expect(error.cause).toBe(cause);
    expect(error.reason).toBe('a record with the same key already exists');
    expect(error.message).toBe('Not saved: a record with the same key already exists.');
    expect(toDbWriteError(error)).toBe(error);
    expect(toDbWriteError(quota()).message).toBe('Not saved: device storage is full.');
    expect(toDbWriteError(new Error('secret response body')).message).toBe('Not saved: the local database could not be written.');
  });
});

describe('write', () => {
  let database: Dexie;
  let failures: WriteFailures;

  beforeEach(async () => {
    const stores = { things: '&id', others: '&id' };
    database = createDatabase(uniqueDbName(), { initialStores: stores, migrations: [], currentStores: stores });
    failures = installWriteFailures(database);
    expect(await openDatabase(database)).toEqual({ ok: true });
  });

  afterEach(async () => {
    database.close();
    await Dexie.delete(database.name);
  });

  it('returns the result of a successful transaction', async () => {
    const result = await write(['things'], async () => {
      await database.table('things').add({ id: 'a' });
      return 'done';
    }, database);
    expect(result).toBe('done');
    await expect(database.table('things').get('a')).resolves.toEqual({ id: 'a' });
  });

  it('maps a quota failure to DbWriteError with quota set and keeps every record in its stored state', async () => {
    await database.table('things').bulkAdd([{ id: 'a', v: 1 }, { id: 'b', v: 1 }]);
    failures.failNext('others', quota);
    const attempt = write(['things', 'others'], async () => {
      await database.table('things').put({ id: 'a', v: 2 });
      await database.table('things').delete('b');
      await database.table('others').add({ id: 'c' });
    }, database);
    await expect(attempt).rejects.toBeInstanceOf(DbWriteError);
    await expect(attempt).rejects.toMatchObject({ quota: true, reason: 'device storage is full' });
    await expect(database.table('things').toArray()).resolves.toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 1 }]);
    await expect(database.table('others').count()).resolves.toBe(0);
  });

  it('maps other failures to DbWriteError without quota', async () => {
    await database.table('things').add({ id: 'a' });
    const attempt = write(['things'], () => database.table('things').add({ id: 'a' }), database);
    await expect(attempt).rejects.toMatchObject({ name: 'DbWriteError', quota: false });
  });
});
