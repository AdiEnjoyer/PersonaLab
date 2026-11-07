import { round } from '../../../core/math/round';
import type { VolumeChange } from './metrics';

/** Weight at up to two decimals without trailing zeros: 100, 102.5, 1.25 (R23.8, R19.6). */
export const formatWeight = (w: number): string => String(round(w, 2));

/** E1RM to the nearest 0.1 kg with one decimal: 116.7 (R23.2). */
export const formatE1rm = (x: number): string => round(x, 1).toFixed(1);

/** Exercise or Session volume to the nearest whole kg (R23.8). */
export const formatVolume = (x: number): string => String(round(x));

/** "<weight> kg × <reps>" (R19.6). */
export const formatWeightReps = (weight: number, reps: number): string => `${formatWeight(weight)} kg × ${reps}`;

/** The exercise name, with " (archived)" while it is archived (R16.5). */
export const displayName = (name: string, archived: boolean): string => (archived ? `${name} (archived)` : name);

/** Routine item summary, e.g. "3 × 8–12" or "3 × 10" when min = max. */
export const formatTarget = (item: { targetSets: number; repMin: number; repMax: number }): string =>
  `${item.targetSets} × ${item.repMin === item.repMax ? item.repMin : `${item.repMin}–${item.repMax}`}`;

/** Signed volume change in kg plus the whole percent when known, or "First session" (R22.8). */
export function formatVolumeChange(c: VolumeChange): string {
  if (c.kind === 'first') return 'First session';
  const kg = round(c.deltaKg);
  const sign = kg > 0 ? '+' : '';
  const pct = c.pct === undefined ? '' : ` (${round(c.pct) > 0 ? '+' : ''}${round(c.pct)}%)`;
  return `${sign}${kg} kg${pct}`;
}
