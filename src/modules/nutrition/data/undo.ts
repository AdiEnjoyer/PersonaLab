import { db } from '../../../core/db/db';
import { write } from '../../../core/db/write';
import { captureSnapshot, recordDiffUndo } from '../../../core/undo/recordDiff';
import { undoService } from '../../../core/undo/undoService';

/** Deletes the record `key` of `table` in one transaction and offers a 6-second Undo (R64). */
export async function deleteWithUndo(table: string, key: string, label: string): Promise<void> {
  const keys = { [table]: [key] };
  const { before, after } = await write([table], async () => {
    const snapshotBefore = await captureSnapshot([table], keys);
    await db.table(table).delete(key);
    return { before: snapshotBefore, after: await captureSnapshot([table], keys) };
  });
  if ((before[table]?.size ?? 0) === 0) return;
  undoService.push(recordDiffUndo(label, before, after));
}