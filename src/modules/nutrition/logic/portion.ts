import { isMultipleOfStep, parseDecimal } from '../../../core/math/decimal';
import { PORTION } from '../constants';

export interface Per100 {
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** Each defined per-100 g value times grams / 100, unrounded; a missing value stays missing (R35.1, R35.9). */
export function scalePortion(p: Per100, grams: number): Per100 {
  const out: Per100 = {};
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const v = p[key];
    if (v !== undefined) out[key] = (v * grams) / 100;
  }
  return out;
}

export const servingsToGrams = (servings: number, servingQuantity: number): number => servings * servingQuantity;

/** Scales `servings` servings of `servingQuantity` g each (R35.7). */
export const scaleServings = (p: Per100, servings: number, servingQuantity: number): Per100 => scalePortion(p, servingsToGrams(servings, servingQuantity));

export type PortionCheck = { ok: true; grams: number } | { ok: false; message: string };

const GRAMS_MESSAGE = `Enter grams from ${PORTION.GRAMS_MIN} to ${PORTION.GRAMS_MAX} with at most 1 decimal.`;

/** Grams: 1 to 5000 with at most 1 decimal (R35.3, R35.10). */
export function validateGrams(text: string): PortionCheck {
  const g = parseDecimal(text, { maxDecimals: 1 });
  if (g === null || g < PORTION.GRAMS_MIN || g > PORTION.GRAMS_MAX) return { ok: false, message: GRAMS_MESSAGE };
  return { ok: true, grams: g };
}

/** Servings: 0.25 to 20 in steps of 0.25, converting to 1 to 5000 g (R35.3, R35.10). */
export function validateServings(text: string, servingQuantity: number): PortionCheck {
  const range = `Enter servings from ${PORTION.SERV_MIN} to ${PORTION.SERV_MAX} in steps of ${PORTION.SERV_STEP}.`;
  const s = parseDecimal(text, { maxDecimals: 20 });
  if (s === null || s < PORTION.SERV_MIN || s > PORTION.SERV_MAX || !isMultipleOfStep(text, PORTION.SERV_STEP)) return { ok: false, message: range };
  const grams = servingsToGrams(s, servingQuantity);
  if (!(grams >= PORTION.GRAMS_MIN && grams <= PORTION.GRAMS_MAX)) {
    return { ok: false, message: `${range} That must be ${PORTION.GRAMS_MIN} to ${PORTION.GRAMS_MAX} g in total.` };
  }
  return { ok: true, grams };
}
