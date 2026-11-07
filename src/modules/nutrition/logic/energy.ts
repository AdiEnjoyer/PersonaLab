import type { TrainingSessionSummary } from '../../../core/registry/capabilities';
import type { Goal, Sex } from '../../../core/profile/schema';
import { addDays, daysBetween, toLocalDate as defaultToLocalDate, type LocalDate } from '../../../core/time/localDate';
import { ACTIVITY, LOGGED_HOURS, MIFFLIN } from '../constants';
import type { GoalAdjust, ProteinFactorSetting, TrainingOverride } from '../settings';
import type { EnergyResult, WeightEntry } from '../types';
import { calorieTarget, goalAdjustFor, proteinFactorFor, proteinTarget } from './targets';

const MS_PER_HOUR = 3_600_000;

/** Mifflin-St Jeor BMR in kcal, unrounded (R29.1). */
export function bmr(p: { sex: Sex; heightCm: number; age: number }, weightKg: number): number {
  return MIFFLIN.W * weightKg + MIFFLIN.H * p.heightCm - MIFFLIN.A * p.age + (p.sex === 'male' ? MIFFLIN.MALE : MIFFLIN.FEMALE);
}

/** Weight of the Weight_Entry with the latest date not after `today`, else the Profile weight (R29.1, R38.6). */
export function currentWeight(weights: readonly WeightEntry[], today: LocalDate, profileWeight: number): number {
  let best: WeightEntry | undefined;
  for (const w of weights) {
    if (w.date <= today && (best === undefined || w.date > best.date)) best = w;
  }
  return best === undefined ? profileWeight : best.weightKg;
}

/** Logged_Training_Hours (R29.2). */
export function loggedTrainingHours(
  sessions: readonly TrainingSessionSummary[],
  today: LocalDate,
  toLocalDate: (ms: number) => LocalDate = defaultToLocalDate,
): number {
  if (sessions.length === 0) return 0;
  let first = toLocalDate(sessions[0]!.startedAt);
  for (const s of sessions) {
    const d = toLocalDate(s.startedAt);
    if (d < first) first = d;
  }
  const n = Math.min(LOGGED_HOURS.MAX_DAYS, Math.max(LOGGED_HOURS.MIN_DAYS, daysBetween(first, today) + 1));
  const windowStart = addDays(today, -(n - 1));
  let sum = 0;
  for (const s of sessions) {
    const d = toLocalDate(s.startedAt);
    if (d < windowStart || d > today) continue;
    sum += Math.min(LOGGED_HOURS.SESSION_CAP_H, Math.max(0, (s.finishedAt - s.startedAt) / MS_PER_HOUR));
  }
  return (sum * 7) / n;
}

/** Effective_Training_Hours and its source (R29.3). */
export function effectiveTrainingHours(i: {
  override: TrainingOverride;
  sessions: readonly TrainingSessionSummary[];
  today: LocalDate;
  profileHours: number;
  toLocalDate?: (ms: number) => LocalDate;
}): { hours: number; source: 'override' | 'logged' | 'profile' } {
  const toLocalDate = i.toLocalDate ?? defaultToLocalDate;
  if (i.override.enabled) return { hours: i.override.hours, source: 'override' };
  const recentStart = addDays(i.today, -(LOGGED_HOURS.RECENT_DAYS - 1));
  const recent = i.sessions.some((s) => {
    const d = toLocalDate(s.startedAt);
    return d >= recentStart && d <= i.today;
  });
  if (recent) return { hours: loggedTrainingHours(i.sessions, i.today, toLocalDate), source: 'logged' };
  return { hours: i.profileHours, source: 'profile' };
}

/** Activity_Factor of the unrounded hours (R29.4): the first row with `h < below`. */
export function activityFactor(h: number): EnergyResult['factor'] {
  return ACTIVITY.find((row) => h < row.below)!.f;
}

export interface EnergyInput {
  profile: { sex: Sex; heightCm: number; age: number; weightKg: number; weeklyTrainingHours: number; goal: Goal };
  weights: readonly WeightEntry[];
  sessions: readonly TrainingSessionSummary[];
  today: LocalDate;
  override: TrainingOverride;
  burnOffset: number;
  goalAdjust: GoalAdjust;
  proteinFactor: ProteinFactorSetting;
  toLocalDate?: (ms: number) => LocalDate;
}

/** All energy values with no intermediate rounding (R29.5). */
export function computeEnergy(i: EnergyInput): EnergyResult {
  const weight = currentWeight(i.weights, i.today, i.profile.weightKg);
  const base = bmr(i.profile, weight);
  const { hours, source } = effectiveTrainingHours({
    override: i.override,
    sessions: i.sessions,
    today: i.today,
    profileHours: i.profile.weeklyTrainingHours,
    ...(i.toLocalDate ? { toLocalDate: i.toLocalDate } : {}),
  });
  const factor = activityFactor(hours);
  const tdee = base * factor;
  const dailyBurn = tdee + i.burnOffset;
  const target = calorieTarget(dailyBurn, goalAdjustFor(i.profile.goal, i.goalAdjust), i.profile.sex);
  return {
    bmr: base,
    factor,
    hours,
    hoursSource: source,
    tdee,
    burnOffset: i.burnOffset,
    dailyBurn,
    calorieTarget: target.kcal,
    floored: target.floored,
    proteinTarget: proteinTarget(weight, proteinFactorFor(i.profile.goal, i.proteinFactor)),
    currentWeight: weight,
  };
}
