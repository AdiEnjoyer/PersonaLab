import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { act, renderHook, waitFor } from '@testing-library/react';
import type Dexie from 'dexie';
import type { DBCoreMutateRequest, IndexableType } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { createDatabase, openDatabase } from '../../db/db';
import { write } from '../../db/write';
import { arbText } from '../../../test/arbitraries/core';
import { installWriteFailures, withTempDb } from '../../../test/helpers/db';
import type { PendingOp } from '../overlay';
import { useOptimisticList } from '../useOptimisticList';

interface Item {
  id: string;
  name: string;
}

const STORES = { items: '&id' };
const TABLE = 'items';
/** A small id pool, so creates, edits and deletes often hit the same record. */
const POOL = 6;

interface Op {
  kind: 'create' | 'edit' | 'delete';
  target: number;
  name: string;
  /** The write of this op is made to fail by the injected middleware. */
  fail: boolean;
  /** Ends the current batch of taps; the next op is tapped after the pending writes had time to progress. */
  pause: boolean;
}

const arbOp: fc.Arbitrary<Op> = fc.record({
  kind: fc.constantFrom<Op['kind']>('create', 'edit', 'delete'),
  target: fc.integer({ min: 0, max: POOL - 1 }),
  name: arbText(0, 8),
  fail: fc.boolean(),
  pause: fc.boolean(),
});

const arbSeed: fc.Arbitrary<Item[]> = fc.uniqueArray(
  fc
    .record({ id: fc.integer({ min: 0, max: POOL - 1 }).map((n) => `r${n}`), name: arbText(0, 8) })
    // Plain objects, like the records read back from the database (fast-check may build null-prototype ones).
    .map(({ id, name }): Item => ({ id, name })),
  { maxLength: POOL, selector: (item) => item.id },
);

const keyOf = (item: Item) => item.id;
const byId = (a: Item, b: Item) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Primary keys a mutation request touches (inbound keys come from the values). */
function keysOf(req: DBCoreMutateRequest): IndexableType[] {
  if (req.type === 'deleteRange') return [];
  if (Array.isArray(req.keys)) return [...(req.keys as IndexableType[])];
  return req.type === 'delete' ? [] : req.values.map((v: Item) => v.id);
}

/** The pure operation applied by the optimistic overlay and by the reference model. */
function applyTo(list: readonly Item[], op: Op, id: string): Item[] {
  switch (op.kind) {
    case 'create':
      return list.some((x) => x.id === id) ? [...list] : [...list, { id, name: op.name }];
    case 'edit':
      return list.map((x) => (x.id === id ? { ...x, name: op.name } : x));
    case 'delete':
      return list.filter((x) => x.id !== id);
  }
}

/** Reference: the successful writes applied once each, in operation order. */
function expectedState(seed: readonly Item[], ops: readonly Op[]): Item[] {
  let list: Item[] = [...seed];
  for (const op of ops) {
    const id = `r${op.target}`;
    if (op.fail) continue;
    list = applyTo(list, op, id);
  }
  return list.sort(byId);
}

describe('useOptimisticList', () => {
  it('after every write settles, the list equals the stored list, with each record written in operation order', async () => {
    // Feature: personal-lab, Property 22: Optimistic UI equals stored state after settling
    await fc.assert(
      fc.asyncProperty(arbSeed, fc.array(arbOp, { minLength: 1, maxLength: 50 }), async (seed, ops) => {
        await withTempDb(
          (name) => createDatabase(name, { initialStores: STORES, migrations: [], currentStores: STORES }),
          async (database: Dexie) => {
            /** Record ids whose next write must fail. Writes of one id run one at a time (write queue). */
            const armed = new Set<string>();
            const failures = installWriteFailures(database);
            failures.failWhen(
              (table, req) => table === TABLE && keysOf(req).some((k) => armed.has(String(k))),
              () => new DOMException('The quota has been exceeded.', 'QuotaExceededError'),
            );
            expect(await openDatabase(database)).toEqual({ ok: true });
            const items = () => database.table<Item>(TABLE);
            await items().bulkAdd(seed);

            const toPendingOp = (op: Op): PendingOp<Item> => {
              const id = `r${op.target}`;
              const mutate = (): Promise<unknown> => {
                switch (op.kind) {
                  case 'create':
                    // A create of an id that exists changes nothing, like an idempotent create.
                    return items()
                      .get(id)
                      .then((existing) => (existing === undefined ? items().add({ id, name: op.name }) : undefined));
                  case 'edit':
                    return items().update(id, { name: op.name });
                  case 'delete':
                    return items().delete(id);
                }
              };
              return {
                key: id,
                apply: (list) => applyTo(list, op, id),
                write: async () => {
                  if (op.fail) armed.add(id);
                  try {
                    await write([TABLE], mutate, database);
                  } finally {
                    armed.delete(id);
                  }
                },
              };
            };

            let errors = 0;
            const { result, unmount } = renderHook(() => {
              const live = useLiveQuery(() => items().orderBy('id').toArray(), []);
              return {
                live,
                ...useOptimisticList(live, keyOf, {
                  onError: () => {
                    errors += 1;
                  },
                }),
              };
            });
            try {
              await waitFor(() => expect(result.current.live).toBeDefined());

              const runs: Promise<boolean>[] = [];
              let batch: Op[] = [];
              const tap = () => {
                const now = batch;
                batch = [];
                act(() => {
                  for (const op of now) runs.push(result.current.run(toPendingOp(op)));
                });
              };
              for (const op of ops) {
                batch.push(op);
                if (op.pause) {
                  tap();
                  await act(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                  });
                }
              }
              tap();

              let outcomes: boolean[] = [];
              await act(async () => {
                outcomes = await Promise.all(runs);
              });

              const stored = (await items().toArray()).sort(byId);
              // Writes of one record were applied in operation order, failed ones not at all.
              expect(stored).toStrictEqual(expectedState(seed, ops));
              expect(errors).toBe(outcomes.filter((ok) => !ok).length);
              // The list on screen equals the stored list once the writes have settled.
              await waitFor(() => expect([...result.current.items].sort(byId)).toStrictEqual(stored));
              await waitFor(() => expect(result.current.live).toStrictEqual(stored));
              expect(result.current.items).toStrictEqual(result.current.live);
            } finally {
              unmount();
            }
          },
        );
      }),
      { numRuns: 100 },
    );
  }, 300_000);
});
