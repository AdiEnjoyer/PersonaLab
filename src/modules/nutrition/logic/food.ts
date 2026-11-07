import { isMultipleOfStep, parseDecimal } from '../../../core/math/decimal';
import { newId as defaultNewId } from '../../../core/ids';
import type { LocalDate } from '../../../core/time/localDate';
import { FOOD_LIMITS, MULTIPLIER } from '../constants';
import { SavedMealItemSchema } from '../schema';
import type { DayMark, FoodEntry, MealSlot, SavedMeal, SavedMealItem } from '../types';

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Unrounded daily totals; missing macros count as 0 (R31.1). */
export function dayTotals(entries: readonly FoodEntry[]): Totals {
  const t: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    t.kcal += e.kcal;
    t.protein += e.protein ?? 0;
    t.carbs += e.carbs ?? 0;
    t.fat += e.fat ?? 0;
  }
  return t;
}

/** Entries under their meal slots (breakfast, lunch, dinner, snacks), in creation order inside a slot (R31.1). */
export function groupBySlot(entries: readonly FoodEntry[]): Record<MealSlot, FoodEntry[]> {
  const out: Record<MealSlot, FoodEntry[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of sorted) out[e.slot].push(e);
  return out;
}

/** A Logged_Day has at least one Food_Entry and no incomplete mark (R31.7). */
export function isLoggedDay(date: LocalDate, entries: readonly FoodEntry[], marks: readonly DayMark[]): boolean {
  if (marks.some((m) => m.date === date && m.incomplete)) return false;
  return entries.some((e) => e.date === date);
}

export interface FoodFormText {
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  grams: string;
}
export interface FoodFields {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  grams?: number;
}
export type FieldErrors = Partial<Record<keyof FoodFormText, string>>;
export const EMPTY_FOOD_FORM: Readonly<FoodFormText> = { name: '', kcal: '', protein: '', carbs: '', fat: '', grams: '' };

const NAME_RULE = `Enter a name of 1 to ${FOOD_LIMITS.NAME} characters.`;
const KCAL_RULE = `Enter kcal from 0 to ${FOOD_LIMITS.KCAL}, with at most 1 decimal place.`;
const MACRO_RULE = `Enter 0 to ${FOOD_LIMITS.MACRO} g, with at most 1 decimal place.`;
const GRAMS_RULE = `Leave empty, or enter ${FOOD_LIMITS.GRAMS_MIN} to ${FOOD_LIMITS.GRAMS_MAX} g, with at most 1 decimal place.`;

function number1dp(text: string): number | null {
  return parseDecimal(text, { maxDecimals: 1, allowComma: true });
}

/** Checks the add or edit food form (R31.2, R31.9). Empty macros become 0; empty grams stay absent. */
export function validateFoodForm(f: FoodFormText): { ok: true; value: FoodFields } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = f.name.trim();
  if (name.length < 1 || name.length > FOOD_LIMITS.NAME) errors.name = NAME_RULE;
  const kcal = f.kcal.trim() === '' ? null : number1dp(f.kcal);
  if (kcal === null || kcal > FOOD_LIMITS.KCAL) errors.kcal = KCAL_RULE;
  const macro = (key: 'protein' | 'carbs' | 'fat'): number => {
    if (f[key].trim() === '') return 0;
    const v = number1dp(f[key]);
    if (v === null || v > FOOD_LIMITS.MACRO) {
      errors[key] = MACRO_RULE;
      return 0;
    }
    return v;
  };
  const protein = macro('protein');
  const carbs = macro('carbs');
  const fat = macro('fat');
  let grams: number | undefined;
  if (f.grams.trim() !== '') {
    const v = number1dp(f.grams);
    if (v === null || v < FOOD_LIMITS.GRAMS_MIN || v > FOOD_LIMITS.GRAMS_MAX) errors.grams = GRAMS_RULE;
    else grams = v;
  }
  if (Object.keys(errors).length > 0 || kcal === null) return { ok: false, errors };
  return { ok: true, value: { name, kcal, protein, carbs, fat, ...(grams !== undefined ? { grams } : {}) } };
}

export type SavedMealFormError = { name?: string; items?: string; itemErrors: Array<FieldErrors | undefined> };

/** Checks the Saved_Meal form: a name and 1 to 50 items with the food field rules (R31.4, R31.9). */
export function validateSavedMealForm(
  nameText: string,
  itemTexts: ReadonlyArray<FoodFormText | SavedMealItem>,
): { ok: true; value: { name: string; items: SavedMealItem[] } } | { ok: false; errors: SavedMealFormError } {
  const errors: SavedMealFormError = { itemErrors: [] };
  const name = nameText.trim();
  if (name.length < 1 || name.length > FOOD_LIMITS.NAME) errors.name = NAME_RULE;
  if (itemTexts.length < 1 || itemTexts.length > FOOD_LIMITS.ITEMS) errors.items = `A meal needs 1 to ${FOOD_LIMITS.ITEMS} items.`;
  const items: SavedMealItem[] = [];
  let itemsOk = true;
  itemTexts.forEach((entered, i) => {
    if (typeof entered.kcal === 'number') {
      // An item copied from a Food_Entry keeps its stored values; they only have to be inside the ranges.
      const checked = SavedMealItemSchema.safeParse(entered);
      if (checked.success) {
        items.push(checked.data);
      } else {
        itemsOk = false;
        errors.itemErrors[i] = { kcal: 'The copied values are outside the allowed ranges. Edit this item.' };
      }
      return;
    }
    const r = validateFoodForm(entered as FoodFormText);
    if (r.ok) {
      items.push(r.value);
    } else {
      itemsOk = false;
      errors.itemErrors[i] = r.errors;
    }
  });
  if (errors.name !== undefined || errors.items !== undefined || !itemsOk) return { ok: false, errors };
  return { ok: true, value: { name, items } };
}
const FIELD_LIMITS: Array<[keyof SavedMealItem & ('kcal' | 'protein' | 'carbs' | 'fat' | 'grams'), number]> = [
  ['kcal', FOOD_LIMITS.KCAL],
  ['protein', FOOD_LIMITS.MACRO],
  ['carbs', FOOD_LIMITS.MACRO],
  ['fat', FOOD_LIMITS.MACRO],
  ['grams', FOOD_LIMITS.GRAMS_MAX],
];

function exceeds(item: SavedMealItem, k: number): boolean {
  return FIELD_LIMITS.some(([field, limit]) => {
    const v = item[field];
    return v !== undefined && v * k > limit;
  });
}

/**
 * Largest multiplier m in {0.25, 0.5, ..., 10} with every item value x m within the limits; `null` when even
 * 0.25 exceeds a limit (R31.10).
 */
export function maxMultiplier(meal: Pick<SavedMeal, 'items'>): number | null {
  let ratio = Infinity;
  for (const item of meal.items) {
    for (const [field, limit] of FIELD_LIMITS) {
      const v = item[field];
      if (v !== undefined && v > 0) ratio = Math.min(ratio, limit / v);
    }
  }
  let m = Math.min(MULTIPLIER.MAX, Math.floor(ratio * 4) / 4);
  // Guards against float error in the division above.
  while (m >= MULTIPLIER.MIN && meal.items.some((item) => exceeds(item, m))) m -= MULTIPLIER.STEP;
  return m >= MULTIPLIER.MIN ? m : null;
}

export interface ScaleContext {
  date: LocalDate;
  slot: MealSlot;
  /** One key per add action; entry i gets `${actionKey}:${i}` (R31.5). */
  actionKey: string;
  now: number;
  newId?: () => string;
}

/** One Food_Entry per item with values x k, unrounded (R31.5), or the first offending item and the largest allowed multiplier (R31.10). */
export function scaleMeal(
  meal: Pick<SavedMeal, 'items'>,
  k: number,
  ctx: ScaleContext,
): { ok: true; entries: FoodEntry[] } | { ok: false; firstItem: string; maxMultiplier: number | null } {
  const bad = meal.items.find((item) => exceeds(item, k));
  if (bad !== undefined) return { ok: false, firstItem: bad.name, maxMultiplier: maxMultiplier(meal) };
  const newId = ctx.newId ?? defaultNewId;
  const entries = meal.items.map<FoodEntry>((item, index) => ({
    id: newId(),
    idemKey: `${ctx.actionKey}:${index}`,
    date: ctx.date,
    slot: ctx.slot,
    name: item.name,
    kcal: item.kcal * k,
    protein: item.protein * k,
    carbs: item.carbs * k,
    fat: item.fat * k,
    ...(item.grams !== undefined ? { grams: item.grams * k } : {}),
    source: 'saved meal',
    createdAt: ctx.now + index,
  }));
  return { ok: true, entries };
}

/** Accepted multiplier values (R31.5): 0.25 to 10 in steps of 0.25. */
export function isValidMultiplier(k: number): boolean {
  return Number.isFinite(k) && k >= MULTIPLIER.MIN && k <= MULTIPLIER.MAX && isMultipleOfStep(k, MULTIPLIER.STEP);
}
