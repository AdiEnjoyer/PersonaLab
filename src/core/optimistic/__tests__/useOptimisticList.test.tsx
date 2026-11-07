import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { createDatabase, openDatabase } from '../../db/db';
import { DbWriteError } from '../../db/errors';
import { write } from '../../db/write';
import { installWriteFailures, uniqueDbName, type WriteFailures } from '../../../test/helpers/db';
import type { PendingOp } from '../overlay';
import { SETTLED_OP_TTL_MS, useOptimisticList, type OptimisticListOptions } from '../useOptimisticList';

interface Item {
  id: string;
  name: string;
}

const keyOf = (item: Item) => item.id;
const STORES = { items: '&id' };

let database: Dexie;
let failures: WriteFailures;

beforeEach(async () => {
  database = createDatabase(uniqueDbName('optimistic'), { initialStores: STORES, migrations: [], currentStores: STORES });
  failures = installWriteFailures(database);
  expect(await openDatabase(database)).toEqual({ ok: true });
});

afterEach(async () => {
  database.close();
  await Dexie.delete(database.name);
});

const items = () => database.table<Item>('items');
const stored = () => items().orderBy('id').toArray();

function putOp(item: Item): PendingOp<Item> {
  return {
    key: item.id,
    apply: (list) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]),
    write: async () => {
      await write(['items'], () => items().put(item), database);
    },
  };
}

function deleteOp(id: string): PendingOp<Item> {
  return {
    key: id,
    apply: (list) => list.filter((x) => x.id !== id),
    write: async () => {
      await write(['items'], () => items().delete(id), database);
    },
  };
}

function useItems(options: OptimisticListOptions<Item>) {
  const live = useLiveQuery(() => stored(), []);
  return { live, ...useOptimisticList(live, keyOf, options) };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useOptimisticList', () => {
  it('shows an op in the same render as the tap, before the write completes', async () => {
    const live: Item[] = [{ id: 'a', name: 'A' }];
    const gate = deferred();
    const { result } = renderHook(() => useOptimisticList(live, keyOf));
    let done!: Promise<boolean>;
    act(() => {
      done = result.current.run({ key: 'b', apply: (list) => [...list, { id: 'b', name: 'B' }], write: () => gate.promise });
    });
    expect(result.current.items).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    gate.resolve();
    await act(async () => {
      await expect(done).resolves.toBe(true);
    });
  });

  it('reverts a failed write to the stored data and reports the error with the op', async () => {
    await items().bulkAdd([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    const onError = vi.fn();
    const { result } = renderHook(() => useItems({ onError }));
    await waitFor(() => expect(result.current.live).toHaveLength(2));

    failures.failNext('items', () => new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const op = deleteOp('a');
    let done!: Promise<boolean>;
    act(() => {
      done = result.current.run(op);
    });
    expect(result.current.items).toEqual([{ id: 'b', name: 'B' }]);

    await act(async () => {
      await expect(done).resolves.toBe(false);
    });
    expect(result.current.items).toEqual(await stored());
    expect(result.current.items).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
    const [error, failedOp] = onError.mock.calls[0]!;
    expect(error).toBeInstanceOf(DbWriteError);
    expect((error as DbWriteError).message).toBe('Not saved: device storage is full.');
    expect(failedOp).toBe(op);
  });

  it('applies the writes of one record in order and ends equal to the database', async () => {
    const { result } = renderHook(() => useItems({}));
    await waitFor(() => expect(result.current.live).toEqual([]));

    let all!: Promise<boolean[]>;
    act(() => {
      all = Promise.all([
        result.current.run(putOp({ id: 'a', name: 'one' })),
        result.current.run(putOp({ id: 'a', name: 'two' })),
        result.current.run(putOp({ id: 'b', name: 'B' })),
        result.current.run(deleteOp('b')),
        result.current.run(putOp({ id: 'a', name: 'three' })),
      ]);
    });
    expect(result.current.items).toEqual([{ id: 'a', name: 'three' }]);

    await act(async () => {
      await expect(all).resolves.toEqual([true, true, true, true, true]);
    });
    await expect(stored()).resolves.toEqual([{ id: 'a', name: 'three' }]);
    await waitFor(() => expect(result.current.live).toEqual([{ id: 'a', name: 'three' }]));
    expect(result.current.items).toEqual([{ id: 'a', name: 'three' }]);
  });

  it('does not show a created record twice while the live list catches up', async () => {
    const { result } = renderHook(() => useItems({}));
    await waitFor(() => expect(result.current.live).toEqual([]));
    await act(async () => {
      await result.current.run(putOp({ id: 'a', name: 'A' }));
    });
    await waitFor(() => expect(result.current.live).toEqual([{ id: 'a', name: 'A' }]));
    expect(result.current.items).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('drops a succeeded op after the TTL even when the live list never changes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const live: Item[] = [];
      const { result } = renderHook(() => useOptimisticList(live, keyOf));
      await act(async () => {
        await result.current.run({ key: 'x', apply: (list) => [...list, { id: 'x', name: 'X' }], write: async () => undefined });
      });
      expect(result.current.items).toEqual([{ id: 'x', name: 'X' }]);
      act(() => {
        vi.advanceTimersByTime(SETTLED_OP_TTL_MS);
      });
      expect(result.current.items).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
