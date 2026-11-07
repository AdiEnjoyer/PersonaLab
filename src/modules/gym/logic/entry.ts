import { LIMITS } from '../constants';

/** Weight text: 0 to 1000 kg, up to two decimals, "." or "," as separator (R19.1). Null when invalid. */
export function parseWeight(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(t)) return null;
  const value = Number(t.replace(',', '.'));
  return value <= LIMITS.WEIGHT_MAX ? value : null;
}

/** Reps text: an integer from 0 to 100 (R19.1). Null when invalid. */
export function parseReps(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const value = Number(t);
  return value <= LIMITS.REPS_MAX ? value : null;
}

export interface DraftView {
  weight?: number | undefined;
  reps?: number | undefined;
}

/** A Set can be completed with a valid weight and reps of at least 1 (R19.7, R19.8). */
export function canComplete(s: DraftView): { ok: true } | { ok: false; invalid: Array<'weight' | 'reps'> } {
  const invalid: Array<'weight' | 'reps'> = [];
  if (s.weight === undefined || !Number.isFinite(s.weight) || s.weight < 0 || s.weight > LIMITS.WEIGHT_MAX) invalid.push('weight');
  if (s.reps === undefined || !Number.isInteger(s.reps) || s.reps < 1 || s.reps > LIMITS.REPS_MAX) invalid.push('reps');
  return invalid.length === 0 ? { ok: true } : { ok: false, invalid };
}
