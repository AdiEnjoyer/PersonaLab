import { useEffect, useState } from 'react';
import { db } from '../../../core/db/db';
import { createIdempotent } from '../../../core/db/idempotent';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { newId } from '../../../core/ids';
import type { LocalDate } from '../../../core/time/localDate';
import { scaleMeal, type FoodFields } from '../logic/food';
import type { DayMark, FoodEntry, MealSlot, SavedMeal, SavedMealItem } from '../types';
import { NUTRITION_TABLES } from './backup';
import { useLiveValue } from './live';
import { deleteWithUndo } from './undo';

const foods = () => db.table<FoodEntry, string>(NUTRITION_TABLES.foodEntries);
const meals = () => db.table<SavedMeal, string>(NUTRITION_TABLES.savedMeals);
const marks = () => db.table<DayMark, string>(NUTRITION_TABLES.dayMarks);

export const readEntriesForDate = (date: LocalDate) => foods().where('date').equals(date).toArray();

/** Food_Entries of one Local_Date, live. */
export function useFoodEntries(date: LocalDate) {
  return useLiveValue(() => readEntriesForDate(date), [date]);
}

export function useFoodEntry(id: string | undefined) {
  return useLiveValue(async () => (id === undefined ? null : ((await foods().get(id)) ?? null)), [id]);
}

/** Adds a manual entry at most once per Idempotency_Key (R31.2). */
export async function addManualEntry(fields: FoodFields, ctx: { date: LocalDate; slot: MealSlot; idemKey: string; now?: number }): Promise<FoodEntry> {
  const entry: FoodEntry = { id: newId(), idemKey: ctx.idemKey, date: ctx.date, slot: ctx.slot, source: 'manual', createdAt: ctx.now ?? Date.now(), ...fields };
  return (await createIdempotent<FoodEntry>(NUTRITION_TABLES.foodEntries, entry)).record;
}

/** Adds a scanned-product entry with unrounded values; a missing macro stays absent (R35.9, R35.11). At most once per key. */
export async function addBarcodeEntry(
  fields: { name: string; kcal: number; protein?: number | undefined; carbs?: number | undefined; fat?: number | undefined; grams: number; barcode: string },
  ctx: { date: LocalDate; slot: MealSlot; idemKey: string; now?: number },
): Promise<FoodEntry> {
  const entry: FoodEntry = stripUndefined({ id: newId(), idemKey: ctx.idemKey, date: ctx.date, slot: ctx.slot, source: 'barcode' as const, createdAt: ctx.now ?? Date.now(), ...fields });
  return (await createIdempotent<FoodEntry>(NUTRITION_TABLES.foodEntries, entry)).record;
}
/** Replaces name, values and slot; date, source and key stay (R31.3). */
export async function updateFoodEntry(id: string, fields: FoodFields, slot: MealSlot): Promise<void> {
  await write([NUTRITION_TABLES.foodEntries], async () => {
    const current = await foods().get(id);
    if (current === undefined) throw new Error('The entry no longer exists.');
    const { grams: _grams, ...rest } = current;
    await foods().put(stripUndefined({ ...rest, ...fields, slot }));
  });
}

export const deleteFoodEntry = (entry: Pick<FoodEntry, 'id'>) => deleteWithUndo(NUTRITION_TABLES.foodEntries, entry.id, 'Food entry deleted');

export type AddMealResult = { ok: true; created: boolean } | { ok: false; firstItem: string; maxMultiplier: number | null };

/**
 * Adds one Food_Entry per item with values x k in one transaction (R31.5). A repeat of the same action key
 * creates nothing: the transaction first checks whether any of the keys exists.
 */
export async function addSavedMealToDay(
  meal: Pick<SavedMeal, 'items'>,
  k: number,
  ctx: { date: LocalDate; slot: MealSlot; actionKey: string; now?: number },
): Promise<AddMealResult> {
  const scaled = scaleMeal(meal, k, { ...ctx, now: ctx.now ?? Date.now() });
  if (!scaled.ok) return scaled;
  const keys = scaled.entries.map((e) => e.idemKey);
  const created = await write([NUTRITION_TABLES.foodEntries], async () => {
    if ((await foods().where('idemKey').anyOf(keys).count()) > 0) return false;
    await foods().bulkAdd(stripUndefined(scaled.entries));
    return true;
  });
  return { ok: true, created };
}

/** All Saved_Meals, oldest first, live. */
export function useSavedMeals() {
  return useLiveValue(async () => (await meals().toArray()).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)), []);
}

export function useSavedMeal(id: string | undefined) {
  return useLiveValue(async () => (id === undefined ? null : ((await meals().get(id)) ?? null)), [id]);
}

export async function createSavedMeal(value: { name: string; items: SavedMealItem[] }, idemKey: string, now = Date.now()): Promise<SavedMeal> {
  const meal: SavedMeal = { id: newId(), idemKey, name: value.name, items: value.items, createdAt: now, updatedAt: now };
  return (await createIdempotent<SavedMeal>(NUTRITION_TABLES.savedMeals, meal)).record;
}

/** Edits a Saved_Meal; Food_Entries made from it are not touched (R31.6). */
export async function updateSavedMeal(id: string, value: { name: string; items: SavedMealItem[] }, now = Date.now()): Promise<void> {
  await write([NUTRITION_TABLES.savedMeals], async () => {
    const current = await meals().get(id);
    if (current === undefined) throw new Error('The meal no longer exists.');
    await meals().put(stripUndefined({ ...current, name: value.name, items: value.items, updatedAt: now }));
  });
}

export const deleteSavedMeal = (meal: Pick<SavedMeal, 'id'>) => deleteWithUndo(NUTRITION_TABLES.savedMeals, meal.id, 'Saved meal deleted');

/** Whether `date` carries the "incomplete" mark, live (R31.7). */
export function useDayMark(date: LocalDate) {
  return useLiveValue(async () => (await marks().get(date)) !== undefined, [date]);
}

/** Sets or clears the incomplete mark of a day (R31.7). */
export async function setDayIncomplete(date: LocalDate, incomplete: boolean): Promise<void> {
  await write([NUTRITION_TABLES.dayMarks], async () => {
    if (incomplete) await marks().put({ date, incomplete: true });
    else await marks().delete(date);
  });
}

/** Tracks which Saved_Meal copy sources the Owner picked; plain helper for the editor. */
export function useEntriesForCopy(date: LocalDate, enabled: boolean) {
  const [entries, setEntries] = useState<FoodEntry[]>();
  useEffect(() => {
    if (!enabled) return;
    void readEntriesForDate(date).then(setEntries, () => setEntries([]));
  }, [date, enabled]);
  return entries;
}