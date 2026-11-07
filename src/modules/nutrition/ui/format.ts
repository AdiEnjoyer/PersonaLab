import { round } from '../../../core/math/round';

/** A whole number for display (kcal, grams). */
export const whole = (x: number): string => String(round(x));

/** One decimal place for display (weights, hours). */
export const oneDecimal = (x: number): string => round(x, 1).toFixed(1);

/** A signed value with 2 decimals, e.g. "-0.50" or "+0.25" (R39.7). */
export function signed2(x: number): string {
  const r = round(x, 2);
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}`;
}