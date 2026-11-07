import { db } from '../../../core/db/db';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { newId } from '../../../core/ids';
import type { LocalDate } from '../../../core/time/localDate';
import { captureSnapshot, recordDiffUndo } from '../../../core/undo/recordDiff';
import { undoService } from '../../../core/undo/undoService';
import type { WeightEntry } from '../types';
import { NUTRITION_TABLES } from './backup';
import { useLiveValue } from './live';
import { deleteWithUndo } from './undo';

const T = NUTRITION_TABLES.weights;
const weights = () => db.table<WeightEntry, string>(T);

export const readWeights = async (): Promise<WeightEntry[]> => (await weights().toArray()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/** All Weight_Entries, oldest date first, live. */
export function useWeights() {
  return useLiveValue(readWeights, []);
}

export interface WeightDraft {
  /** Set when editing an existing entry. */
  id?: string;
  /** One key per opened form (R11.1). */
  idemKey: string;
  date: LocalDate;
  weightKg: number;
}

/**
 * Adds or edits a Weight_Entry so that its date keeps exactly one entry (R38.2, R38.3): any other entry on
 * that date is replaced, and the replacement offers an Undo that restores the replaced weight. A repeat of an
 * add with the same Idempotency_Key changes nothing.
 */
export async function saveWeight(draft: WeightDraft, now = Date.now()): Promise<{ replaced: boolean }> {
  const result = await write([T], async () => {
    if (draft.id === undefined && (await weights().where('idemKey').equals(draft.idemKey).count()) > 0) return { replaced: false };
    const current = draft.id === undefined ? undefined : await weights().get(draft.id);
    if (draft.id !== undefined && current === undefined) throw new Error('The weight entry no longer exists.');
    const other = await weights().where('date').equals(draft.date).first();
    const id = current?.id ?? newId();
    const victim = other !== undefined && other.id !== id ? other : undefined;
    const keys = { [T]: [id, ...(victim ? [victim.id] : [])] };
    const before = await captureSnapshot([T], keys);
    if (victim) await weights().delete(victim.id);
    await weights().put(
      stripUndefined({ id, idemKey: current?.idemKey ?? draft.idemKey, date: draft.date, weightKg: draft.weightKg, createdAt: current?.createdAt ?? now }),
    );
    const after = await captureSnapshot([T], keys);
    return { replaced: victim !== undefined, before, after };
  });
  if (result.replaced && 'before' in result && result.before && result.after) {
    undoService.push(recordDiffUndo('Weight replaced', result.before, result.after));
  }
  return { replaced: result.replaced };
}

export const deleteWeight = (entry: Pick<WeightEntry, 'id'>) => deleteWithUndo(T, entry.id, 'Weight deleted');