import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toDbWriteError, type DbWriteError } from '../db/errors';
import { enqueueWrite } from '../db/writeQueue';
import { applyOverlay, dedupeByKey, type PendingOp } from './overlay';

/**
 * Longest time a succeeded op stays in the overlay while waiting for the live query to deliver the stored
 * change. Normally the next live value removes it within a few milliseconds.
 */
export const SETTLED_OP_TTL_MS = 1000;

export interface OptimisticListOptions<T> {
  /**
   * Called after a failed write, once the op has been removed from the overlay (so the list shows the stored
   * state again). The UI shows the R3.5 error Toast and, for a delete, closes its Undo_Toast (R63.2).
   */
  onError?: (error: DbWriteError, op: PendingOp<T>) => void;
}

export interface OptimisticList<T> {
  /** The live list with every pending op applied, in op order (R63.1). */
  items: T[];
  /**
   * Applies `op` to `items` at once, writes it through the record's write queue and resolves with `true`
   * when the write succeeded or `false` when it failed (R63.2, R63.3).
   */
  run(op: PendingOp<T>): Promise<boolean>;
}

interface Entry<T> {
  seq: number;
  op: PendingOp<T>;
  /** `pending` until the write settles successfully; failed ops are removed at once. */
  status: 'pending' | 'settled';
  /** The live list current when the write succeeded; the op is dropped as soon as `live` changes from it. */
  liveAtSettle?: readonly T[] | undefined;
}

const isActive = <T>(entry: Entry<T>, live: readonly T[] | undefined) =>
  entry.status === 'pending' || entry.liveAtSettle === live;

/**
 * An optimistic overlay on a live Local_Database list (R63).
 *
 * `run(op)` adds the op to the overlay synchronously (React state), so the change shows in the same render
 * as the tap, and writes it through `enqueueWrite(op.key)`. A failed op is removed at once, so the list
 * reverts to the stored data, and `onError` is called. A succeeded op stays until the live list delivers the
 * stored change (at most `SETTLED_OP_TTL_MS`), so the screen does not flash the old state in between; it
 * applies a change that is already stored, so it never shows anything the database does not hold. Once every
 * op has settled the list equals `live`, which equals the database (R63.3, R63.4).
 */
export function useOptimisticList<T>(
  live: readonly T[] | undefined,
  keyOf: (item: T) => string,
  options: OptimisticListOptions<T> = {},
): OptimisticList<T> {
  const [entries, setEntries] = useState<readonly Entry<T>[]>([]);
  const seqRef = useRef(0);
  const liveRef = useRef(live);
  const onErrorRef = useRef(options.onError);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useLayoutEffect(() => {
    liveRef.current = live;
    onErrorRef.current = options.onError;
  });

  // Drop succeeded ops once the live list has moved on from the value it had when they settled.
  useEffect(() => {
    setEntries((current) => {
      const kept = current.filter((e) => isActive(e, live));
      return kept.length === current.length ? current : kept;
    });
  }, [live]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const items = useMemo(
    () =>
      dedupeByKey(
        applyOverlay(
          live ?? [],
          entries.filter((e) => isActive(e, live)).map((e) => e.op),
        ),
        keyOf,
      ),
    [entries, live, keyOf],
  );

  const run = useCallback(async (op: PendingOp<T>): Promise<boolean> => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setEntries((current) => [...current, { seq, op, status: 'pending' }]);
    try {
      await enqueueWrite(op.key, () => op.write());
    } catch (error) {
      setEntries((current) => current.filter((e) => e.seq !== seq));
      onErrorRef.current?.(toDbWriteError(error), op);
      return false;
    }
    const liveAtSettle = liveRef.current;
    setEntries((current) => current.map((e) => (e.seq === seq ? { ...e, status: 'settled', liveAtSettle } : e)));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setEntries((current) => current.filter((e) => e.seq !== seq));
    }, SETTLED_OP_TTL_MS);
    timers.current.add(timer);
    return true;
  }, []);

  return { items, run };
}
