import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db/db';
import { createIdempotent } from '../../../core/db/idempotent';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { enqueueWrite } from '../../../core/db/writeQueue';
import { newId } from '../../../core/ids';
import { captureSnapshot, recordDiffUndo } from '../../../core/undo/recordDiff';
import { undoService } from '../../../core/undo/undoService';
import type { Routine } from '../types';
import { GYM_TABLES } from './backup';

const byCreation = (a: Routine, b: Routine) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** All routines, oldest first. Undefined while the first read is pending. */
export function useRoutines(): Routine[] | undefined {
  return useLiveQuery(async () => (await db.table<Routine>(GYM_TABLES.routines).toArray()).sort(byCreation), []);
}

/** One routine; `null` when it does not exist; undefined while loading. */
export function useRoutine(id: string): Routine | null | undefined {
  return useLiveQuery(async () => (await db.table<Routine>(GYM_TABLES.routines).get(id)) ?? null, [id]);
}

/** Creates an empty routine at most once per Idempotency_Key (R17.1). `name` must be validated and trimmed. */
export async function createRoutine(name: string, idemKey: string, now = Date.now()): Promise<Routine> {
  const { record } = await createIdempotent<Routine>(GYM_TABLES.routines, { id: newId(), idemKey, name, items: [], createdAt: now, updatedAt: now });
  return record;
}

/**
 * Applies `change` to the stored routine inside one transaction and writes the whole record, queued per
 * routine so edits apply in tap order (R17.7). A change that throws leaves the record as it was.
 */
export function updateRoutine(id: string, change: (routine: Routine) => Routine, now = Date.now()): Promise<void> {
  return enqueueWrite(id, () =>
    write([GYM_TABLES.routines], async () => {
      const table = db.table<Routine>(GYM_TABLES.routines);
      const current = await table.get(id);
      if (current === undefined) throw new Error('The routine no longer exists.');
      await table.put(stripUndefined({ ...change(current), updatedAt: now }));
    }),
  );
}

/** Deletes the routine and offers Undo for 6 seconds (R17.8). Sessions keep the recorded routine name. */
export async function deleteRoutine(id: string): Promise<void> {
  const keys = { [GYM_TABLES.routines]: [id] };
  const { before, after } = await write([GYM_TABLES.routines], async () => {
    const snapshotBefore = await captureSnapshot([GYM_TABLES.routines], keys);
    await db.table(GYM_TABLES.routines).delete(id);
    return { before: snapshotBefore, after: await captureSnapshot([GYM_TABLES.routines], keys) };
  });
  // The deleted record is only in `before`; undo puts it back (after holds nothing, so nothing is deleted).
  undoService.push(recordDiffUndo('Routine deleted', before, after));
}
