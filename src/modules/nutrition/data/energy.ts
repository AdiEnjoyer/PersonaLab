import { db } from '../../../core/db/db';
import { getProfile } from '../../../core/profile/repo';
import type { Goal, Sex } from '../../../core/profile/schema';
import { getCapability, type TrainingSessionSummary } from '../../../core/registry/capabilities';
import { MODULES } from '../../../core/registry/modules';
import { readSetting } from '../../../core/settings/repo';
import { addDays, type LocalDate } from '../../../core/time/localDate';
import { computeEnergy } from '../logic/energy';
import { trendCorrection, type TrendResult } from '../logic/trend';
import { NUTRITION_SETTING_KEYS, type GoalAdjust, type ProteinFactorSetting, type TrainingOverride } from '../settings';
import type { DayMark, EnergyResult, FoodEntry, WeightEntry } from '../types';
import { NUTRITION_TABLES } from './backup';
import { useLiveValue } from './live';
import { readBurnOffset, readIgnoreUntil } from './state';

export type EnergyState =
  /** No Profile yet: no energy values can be computed (R32.6). */
  | { status: 'no-profile' }
  | { status: 'ready'; energy: EnergyResult; sex: Sex; goal: Goal };

/** Finished Sessions through the `trainingLog` capability; none when no module provides it (R29.3 c). */
async function readSessions(): Promise<TrainingSessionSummary[]> {
  const log = getCapability('trainingLog', MODULES);
  return log === undefined ? [] : log.listFinishedSessions();
}

/**
 * Reads Profile, settings, Weight_Entries, Burn_Offset and Finished Sessions and computes the energy values
 * (R29.11). Any read failure rejects, so no partial values are ever shown (R29.13). Safe inside `liveQuery`.
 */
export async function readEnergy(today: LocalDate): Promise<EnergyState> {
  const [profile, override, goalAdjust, proteinFactor, weights, burnOffset, sessions] = await Promise.all([
    getProfile(),
    readSetting<TrainingOverride>(NUTRITION_SETTING_KEYS.trainingOverride),
    readSetting<GoalAdjust>(NUTRITION_SETTING_KEYS.goalAdjust),
    readSetting<ProteinFactorSetting>(NUTRITION_SETTING_KEYS.proteinFactor),
    db.table<WeightEntry>(NUTRITION_TABLES.weights).toArray(),
    readBurnOffset(),
    readSessions(),
  ]);
  if (profile === null) return { status: 'no-profile' };
  const energy = computeEnergy({ profile, weights, sessions, today, override, burnOffset, goalAdjust, proteinFactor });
  return { status: 'ready', energy, sex: profile.sex, goal: profile.goal };
}

/** Live energy values for `today`; `failed` is set when any input could not be read (R29.13). */
export function useEnergy(today: LocalDate) {
  return useLiveValue(() => readEnergy(today), [today]);
}

export interface TrendState {
  energy: EnergyState;
  result: TrendResult;
  ignoreUntil: LocalDate | undefined;
}

/** Weight, food and mark data for the Trend_Corrector, and its result (R39.1). */
export async function readTrend(today: LocalDate): Promise<TrendState> {
  const from = addDays(today, -30);
  const [energy, weights, foods, marks, ignoreUntil] = await Promise.all([
    readEnergy(today),
    db.table<WeightEntry>(NUTRITION_TABLES.weights).toArray(),
    db.table<FoodEntry>(NUTRITION_TABLES.foodEntries).where('date').between(from, today, true, true).toArray(),
    db.table<DayMark>(NUTRITION_TABLES.dayMarks).toArray(),
    readIgnoreUntil(),
  ]);
  return { energy, result: trendCorrection({ today, weights, foods, marks }), ignoreUntil };
}

export function useTrend(today: LocalDate) {
  return useLiveValue(() => readTrend(today), [today]);
}