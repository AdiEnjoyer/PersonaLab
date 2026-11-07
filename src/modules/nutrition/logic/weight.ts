import { parseDecimal } from '../../../core/math/decimal';
import { addDays, daysBetween, type LocalDate } from '../../../core/time/localDate';
import { WEIGHT_LIMITS } from '../constants';
import type { WeightEntry } from '../types';

/** Weight_Trend at `d`: mean of the unrounded weights dated d - 6 to d, or `undefined` when none (R38.4). */
export function trendAt(entries: readonly Pick<WeightEntry, 'date' | 'weightKg'>[], d: LocalDate): number | undefined {
  const from = addDays(d, -6);
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    if (e.date >= from && e.date <= d) {
      sum += e.weightKg;
      n += 1;
    }
  }
  return n === 0 ? undefined : sum / n;
}

/** The trend for every date from `from` to `to`; entries before `from` still count (R38.4, R38.5). */
export function trendSeries(
  entries: readonly Pick<WeightEntry, 'date' | 'weightKg'>[],
  from: LocalDate,
  to: LocalDate,
): Array<{ date: LocalDate; value?: number }> {
  const out: Array<{ date: LocalDate; value?: number }> = [];
  const days = daysBetween(from, to);
  for (let i = 0; i <= days; i++) {
    const date = addDays(from, i);
    const value = trendAt(entries, date);
    out.push(value === undefined ? { date } : { date, value });
  }
  return out;
}

export type WeightFormErrors = { weight?: string; date?: string };

/** Checks a weight form: 30.0 to 300.0 kg with at most one decimal, date not after today (R38.1, R38.9). */
export function validateWeightForm(
  text: string,
  date: LocalDate,
  today: LocalDate,
): { ok: true; weightKg: number } | { ok: false; errors: WeightFormErrors } {
  const errors: WeightFormErrors = {};
  const v = text.trim() === '' ? null : parseDecimal(text, { maxDecimals: 1, allowComma: true });
  if (v === null || v < WEIGHT_LIMITS.MIN || v > WEIGHT_LIMITS.MAX) {
    errors.weight = `Enter a weight from ${WEIGHT_LIMITS.MIN.toFixed(1)} to ${WEIGHT_LIMITS.MAX.toFixed(1)} kg, with at most 1 decimal place.`;
  }
  if (date === '' || date > today) errors.date = 'Choose a date that is not after today.';
  if (errors.weight !== undefined || errors.date !== undefined || v === null) return { ok: false, errors };
  return { ok: true, weightKg: v };
}
