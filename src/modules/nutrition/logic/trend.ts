import { round } from '../../../core/math/round';
import { addDays, daysBetween, type LocalDate } from '../../../core/time/localDate';
import { KCAL_PER_KG, TREND } from '../constants';
import type { DayMark, FoodEntry, WeightEntry } from '../types';

export interface TrendInput {
  today: LocalDate;
  weights: readonly WeightEntry[];
  foods: readonly FoodEntry[];
  marks: readonly DayMark[];
}

export type Shortfall =
  | { kind: 'history'; missing: number }
  | { kind: 'weights'; block: 'first' | 'last'; missing: number }
  | { kind: 'logged'; missing: number };

export type TrendResult =
  | { kind: 'insufficient'; L: number; shortfalls: Shortfall[] }
  | { kind: 'computed'; L: number; D: number; I: number; dW: number; C: number };

/** C = I - dW x 7700 / D (R39.6). */
export const correctedBurn = (I: number, dW: number, D: number): number => I - (dW * KCAL_PER_KG) / D;

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Trend_Corrector (R39.1 to R39.8): the window ends yesterday, so entries dated today or later are ignored.
 * Returns the shortfalls when a suggestion condition fails, else I, dW, D and the corrected burn C.
 */
export function trendCorrection(i: TrendInput): TrendResult {
  const yesterday = addDays(i.today, -1);
  const weights = i.weights.filter((w) => w.date <= yesterday);
  if (weights.length === 0) return { kind: 'insufficient', L: 0, shortfalls: [{ kind: 'history', missing: TREND.MIN_L }] };
  const earliest = weights.reduce((min, w) => (w.date < min ? w.date : min), weights[0]!.date);
  const L = Math.min(TREND.MAX_L, daysBetween(earliest, yesterday) + 1);
  const start = addDays(yesterday, -(L - 1));

  const incomplete = new Set(i.marks.filter((m) => m.incomplete).map((m) => m.date));
  const kcalByDay = new Map<LocalDate, number>();
  for (const f of i.foods) {
    if (f.date < start || f.date > yesterday || incomplete.has(f.date)) continue;
    kcalByDay.set(f.date, (kcalByDay.get(f.date) ?? 0) + f.kcal);
  }
  const loggedDays = kcalByDay.size;

  const firstEnd = addDays(start, TREND.BLOCK - 1);
  const lastStart = addDays(yesterday, -(TREND.BLOCK - 1));
  const inWindow = weights.filter((w) => w.date >= start);
  const firstBlock = inWindow.filter((w) => w.date <= firstEnd);
  const lastBlock = inWindow.filter((w) => w.date >= lastStart);
  const countDates = (block: readonly WeightEntry[]) => new Set(block.map((w) => w.date)).size;

  const shortfalls: Shortfall[] = [];
  if (L < TREND.MIN_L) {
    shortfalls.push({ kind: 'history', missing: TREND.MIN_L - L });
  } else {
    const first = countDates(firstBlock);
    const last = countDates(lastBlock);
    if (first < TREND.MIN_BLOCK_DATES) shortfalls.push({ kind: 'weights', block: 'first', missing: TREND.MIN_BLOCK_DATES - first });
    if (last < TREND.MIN_BLOCK_DATES) shortfalls.push({ kind: 'weights', block: 'last', missing: TREND.MIN_BLOCK_DATES - last });
  }
  const neededLogged = Math.ceil(TREND.LOGGED_SHARE * L);
  if (neededLogged - loggedDays > 0) shortfalls.push({ kind: 'logged', missing: neededLogged - loggedDays });
  if (shortfalls.length > 0) return { kind: 'insufficient', L, shortfalls };

  let kcalSum = 0;
  for (const v of kcalByDay.values()) kcalSum += v;
  const I = kcalSum / loggedDays;
  const dW = mean(lastBlock.map((w) => w.weightKg)) - mean(firstBlock.map((w) => w.weightKg));
  const D = L - TREND.BLOCK;
  return { kind: 'computed', L, D, I, dW, C: correctedBurn(I, dW, D) };
}

export type SuggestionView = 'none' | 'suggest' | 'out-of-range' | 'shortfalls' | 'close-enough';

/** What the burn-correction card shows (R39.7, R39.15, R39.16). Comparisons use unrounded C and Daily_Burn. */
export function suggestionView(r: TrendResult, dailyBurn: number, ignoreUntil?: LocalDate, today?: LocalDate): SuggestionView {
  if (r.kind === 'insufficient') return 'shortfalls';
  if (r.C < TREND.C_MIN || r.C > TREND.C_MAX) return 'out-of-range';
  if (Math.abs(r.C - dailyBurn) < TREND.MIN_DIFF) return 'close-enough';
  if (ignoreUntil !== undefined && today !== undefined && ignoreUntil > today) return 'none';
  return 'suggest';
}

/** Burn_Offset stored by "Accept": C - TDEE rounded to a whole kcal (R39.9), replacing the old offset. */
export function offsetFromCorrection(C: number, tdee: number): number {
  return round(C - tdee);
}
