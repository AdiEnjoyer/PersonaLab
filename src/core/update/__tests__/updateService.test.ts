import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTempDb } from '../../../test/helpers/db';
import { createDatabase, openDatabase } from '../../db/db';
import { buildStores, CORE_TABLES, META_KEYS } from '../../db/tables';
import { requestPersistOnce, getPersistStatus } from '../../storage/persist';
import { createUpdateService, UPDATE_MESSAGES, type UpdateDeps } from '../updateService';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stores = buildStores([]);

async function withDb<T>(fn: (database: UpdateDeps['database']) => Promise<T>): Promise<T> {
  return withTempDb(
    (name) => createDatabase(name, { initialStores: stores, migrations: [], currentStores: stores }),
    async (opened) => {
      await openDatabase(opened);
      return fn(opened);
    },
  );
}

function setup(database: UpdateDeps['database'], overrides: Partial<UpdateDeps> = {}) {
  let handlers!: Parameters<UpdateDeps['register']>[0];
  const update = vi.fn(async () => undefined);
  const updateSW = vi.fn(async () => undefined);
  const deps: UpdateDeps = {
    register: (options) => {
      handlers = options;
      return updateSW;
    },
    database,
    now: () => 10_000_000,
    isOnline: () => true,
    fetchRemoteVersion: async () => '2.0.0+new',
    flushAll: async () => undefined,
    appVersion: '1.0.0+old',
    ...overrides,
  };
  const service = createUpdateService(deps);
  service.start();
  handlers.onRegisteredSW('sw.js', { update });
  return { service, handlers, update, updateSW };
}

const lastCheck = (database: UpdateDeps['database']) =>
  database.table(CORE_TABLES.meta).get(META_KEYS.lastUpdateCheckAt) as Promise<{ value: number } | undefined>;

describe('updateService', () => {
  it('shows the update state when the remote version differs, and hides it on a same version', async () => {
    await withDb(async (database) => {
      const a = setup(database);
      a.handlers.onNeedRefresh();
      await vi.waitFor(() => expect(a.service.getState().visible).toBe(true));
      a.service.dismiss();
      expect(a.service.getState()).toMatchObject({ available: true, visible: false });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(a.service.getState().visible).toBe(true);

      const b = setup(database, { fetchRemoteVersion: async () => '1.0.0+old' });
      b.handlers.onNeedRefresh();
      await vi.waitFor(() => expect(b.service.getState().available).toBe(true));
      expect(b.service.getState().visible).toBe(false);
    });
  });

  it('reload waits for the flush, then asks the worker to take over', async () => {
    await withDb(async (database) => {
      let release!: () => void;
      const flushAll = () => new Promise<void>((r) => (release = r));
      const { service, updateSW } = setup(database, { flushAll });
      const done = service.reload();
      await Promise.resolve();
      expect(updateSW).not.toHaveBeenCalled();
      release();
      await done;
      expect(updateSW).toHaveBeenCalledWith(true);
    });
  });

  it('postpones the update with the R10.5 message when the flush times out', async () => {
    vi.useFakeTimers();
    // No database is needed: the update check inside setup() fails silently on the stub.
    const { service, updateSW } = setup({} as UpdateDeps['database'], { flushAll: () => new Promise(() => undefined) });
    const done = service.reload();
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(updateSW).not.toHaveBeenCalled();
    expect(service.getState()).toMatchObject({ visible: true, notice: UPDATE_MESSAGES.postponed });
  });
  it('checks at most hourly, and an offline check is silent and keeps lastUpdateCheckAt', async () => {
    await withDb(async (database) => {
      const first = setup(database);
      await vi.waitFor(async () => expect((await lastCheck(database))?.value).toBe(10_000_000));
      expect(first.update).toHaveBeenCalledTimes(1);
      await first.service.checkIfDue();
      expect(first.update).toHaveBeenCalledTimes(1);

      const offline = setup(database, { isOnline: () => false, now: () => 99_000_000 });
      await offline.service.checkIfDue();
      expect(offline.update).not.toHaveBeenCalled();
      expect((await lastCheck(database))?.value).toBe(10_000_000);

      const failing = setup(database, { now: () => 99_000_000 });
      failing.update.mockRejectedValue(new Error('network'));
      await failing.service.checkIfDue();
      expect((await lastCheck(database))?.value).toBe(10_000_000);
    });
  });
});

describe('requestPersistOnce', () => {
  it('asks once and records the result', async () => {
    await withDb(async (database) => {
      const persist = vi.fn(async () => true);
      vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } });
      await requestPersistOnce(database);
      await requestPersistOnce(database);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(await getPersistStatus(database)).toBe('granted');
    });
  });
});