import { isMultipleOfStep } from '../../../core/math/decimal';
import { LIMITS, REST, ROUTINE_ITEM_DEFAULTS } from '../constants';
import type { Routine, RoutineItem } from '../types';

export type ItemField = 'targetSets' | 'repMin' | 'repMax' | 'restSec';

export type FieldResult = { ok: true; value: number | undefined } | { ok: false; message: string };

export const REP_ORDER_MESSAGE = 'Minimum reps must not exceed maximum reps';
export const NAME_MESSAGE = `The name must have 1 to ${LIMITS.ROUTINE_NAME} characters.`;

const RANGE_MESSAGES: Record<ItemField, string> = {
  targetSets: `Target sets must be a whole number from 1 to ${LIMITS.TARGET_SETS_MAX}.`,
  repMin: `Minimum reps must be a whole number from 1 to ${LIMITS.REPS_MAX}.`,
  repMax: `Maximum reps must be a whole number from 1 to ${LIMITS.REPS_MAX}.`,
  restSec: `Rest time must be from ${REST.ITEM_MIN} to ${REST.MAX} seconds in steps of ${REST.STEP}, or empty.`,
};

const RANGES: Record<ItemField, [number, number]> = {
  targetSets: [1, LIMITS.TARGET_SETS_MAX],
  repMin: [1, LIMITS.REPS_MAX],
  repMax: [1, LIMITS.REPS_MAX],
  restSec: [REST.ITEM_MIN, REST.MAX],
};

/** R17.3, R17.4, R17.10. A rejected change leaves the stored item as it was (the caller keeps `item`). */
export function validateItemField(field: ItemField, text: string, item: Pick<RoutineItem, 'repMin' | 'repMax'>): FieldResult {
  const t = text.trim();
  if (field === 'restSec' && t === '') return { ok: true, value: undefined };
  if (!/^\d+$/.test(t)) return { ok: false, message: RANGE_MESSAGES[field] };
  const value = Number(t);
  const [min, max] = RANGES[field];
  if (value < min || value > max) return { ok: false, message: RANGE_MESSAGES[field] };
  if (field === 'restSec' && !isMultipleOfStep(t, REST.STEP)) return { ok: false, message: RANGE_MESSAGES[field] };
  if (field === 'repMin' && value > item.repMax) return { ok: false, message: REP_ORDER_MESSAGE };
  if (field === 'repMax' && value < item.repMin) return { ok: false, message: REP_ORDER_MESSAGE };
  return { ok: true, value };
}

/** Applies a validated field value to an item (restSec undefined removes the rest time). */
export function setItemField(item: RoutineItem, field: ItemField, value: number | undefined): RoutineItem {
  if (field === 'restSec') {
    const { restSec: _removed, ...rest } = item;
    void _removed;
    return value === undefined ? rest : { ...rest, restSec: value };
  }
  return { ...item, [field]: value as number };
}

/** R17.1, R17.9. */
export function validateRoutineName(text: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = text.trim();
  return name.length >= 1 && name.length <= LIMITS.ROUTINE_NAME ? { ok: true, name } : { ok: false, message: NAME_MESSAGE };
}

/** Free slots for the picker: 50 minus the current number of items (R17.2). */
export const remainingSlots = (r: Pick<Routine, 'items'>): number => Math.max(0, LIMITS.ROUTINE_ITEMS - r.items.length);

/** One new item per id, in order, at the end, with the defaults (R17.11). The 50-item cap is never exceeded. */
export function appendItems(r: Routine, exerciseIds: readonly string[], newItemId: () => string): Routine {
  const added: RoutineItem[] = exerciseIds.slice(0, remainingSlots(r)).map((exerciseId) => ({
    itemId: newItemId(),
    exerciseId,
    ...ROUTINE_ITEM_DEFAULTS,
  }));
  return { ...r, items: [...r.items, ...added] };
}

/** Moves the item at `from` to position `to`. Out-of-range moves return the list unchanged. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const n = items.length;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n || from === to) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

export const moveUp = <T>(items: readonly T[], i: number): T[] => moveItem(items, i, i - 1);
export const moveDown = <T>(items: readonly T[], i: number): T[] => moveItem(items, i, i + 1);
export const canMoveUp = (i: number): boolean => i > 0;
export const canMoveDown = (i: number, length: number): boolean => i < length - 1;
