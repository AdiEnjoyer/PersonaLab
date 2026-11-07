import { round } from '../../../core/math/round';
import type { Goal, Sex } from '../../../core/profile/schema';
import { CALORIE_FLOOR, PROTEIN_DEFAULT } from '../constants';
import type { GoalAdjust, ProteinFactorSetting } from '../settings';

/**
 * Calorie_Target (R30.3, R30.4, R30.10): `round(dailyBurn + adjust)`, raised to the floor of the sex
 * (1500 male, 1200 female). `floored` is true exactly when the rounded value was below the floor.
 */
export function calorieTarget(dailyBurn: number, adjust: number, sex: Sex): { kcal: number; floored: boolean } {
  const k = round(dailyBurn + adjust);
  const floor = CALORIE_FLOOR[sex];
  return { kcal: Math.max(k, floor), floored: k < floor };
}

/** Protein_Target in whole grams (R30.6). */
export function proteinTarget(weightKg: number, factor: number): number {
  return round(weightKg * factor);
}

/** The protein factor of `goal`: the stored number, or the goal default when the setting is 'default' (R30.5). */
export function proteinFactorFor(goal: Goal, setting: ProteinFactorSetting): number {
  const value = setting[goal];
  return value === 'default' ? PROTEIN_DEFAULT[goal] : value;
}

/** The goal adjustment of the current goal (R30.1). */
export function goalAdjustFor(goal: Goal, adjust: GoalAdjust): number {
  return adjust[goal];
}
