import { round } from '../../../core/math/round';
import { addDays, type LocalDate } from '../../../core/time/localDate';
import { MUSCLES, SPLIT, TRACKED_MUSCLES } from '../constants';
import type { Muscle, Session } from '../types';
import { isCompletedSet } from './metrics';
export type TrackedMuscle = (typeof TRACKED_MUSCLES)[number];
export type SplitClass = 'low' | 'in range' | 'high';
export interface SplitInput {
  /** Any status; only finished Sessions are used. */
  sessions: readonly Session[];
  exercises: ReadonlyMap<string, { primaryMuscles: readonly string[]; secondaryMuscles: readonly string[] }>;
  windowEnd: LocalDate;
  toLocalDate: (ms: number) => LocalDate;
}
export type SplitFlag =
  | { type: 'untrained'; muscle: TrackedMuscle; message: string }
  | { type: 'pushPull'; message: string }
  | { type: 'quadHamstring'; message: string }
  | { type: 'onceAWeek'; muscle: TrackedMuscle; message: string };
export interface SplitResult {
  weeklySets: Record<Muscle, number>;
  classes: Record<Muscle, SplitClass>;
  frequency: Record<TrackedMuscle, number>;
  sessionCount: number;
  flags: SplitFlag[];
  emptyMessage?: string;
}
export const EMPTY_SPLIT_MESSAGE = 'No workouts were finished in this week.';
const KNOWN = new Set<string>(MUSCLES);
const TRACKED_SET = new Set<string>(TRACKED_MUSCLES);
export const classify = (v: number): SplitClass => (v < SPLIT.LOW_BELOW ? 'low' : v <= SPLIT.HIGH_ABOVE ? 'in range' : 'high');
/** At most one decimal, no trailing ".0" (R27.9). */
export const formatSets = (v: number): string => String(round(v, 1));
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** The 7 Local_Dates ending at `windowEnd`, oldest first. */
export const windowDates = (windowEnd: LocalDate): LocalDate[] => Array.from({ length: SPLIT.WINDOW_DAYS }, (_, i) => addDays(windowEnd, i - (SPLIT.WINDOW_DAYS - 1)));
/** The window end moved by whole weeks (R26.9, R26.10). */
export const shiftWindow = (windowEnd: LocalDate, weeks: number): LocalDate => addDays(windowEnd, weeks * SPLIT.STEP_DAYS);
function muscleSets(ex: { primaryMuscles: readonly string[]; secondaryMuscles: readonly string[] }): { primary: Set<string>; secondary: Set<string> } {
  const primary = new Set(ex.primaryMuscles.filter((m) => KNOWN.has(m)));
  const secondary = new Set(ex.secondaryMuscles.filter((m) => KNOWN.has(m) && !primary.has(m)));
  return { primary, secondary };
}
function pairFlag(first: [string, number], second: [string, number]): string | undefined {
  const [aName, a] = first;
  const [bName, b] = second;
  const text = (r: string) => `${capital(aName)} ${formatSets(a)} sets vs ${bName} ${formatSets(b)} sets${r}`;
  if (a > 0 && b > 0) {
    const ratio = Math.max(a, b) / Math.min(a, b);
    if (ratio <= SPLIT.IMBALANCE_RATIO) return undefined;
    const label = `${round(ratio, 1).toFixed(1)}\u00d7`;
    return a >= b ? text(` (${label})`) : `${capital(bName)} ${formatSets(b)} sets vs ${aName} ${formatSets(a)} sets (${label})`;
  }
  if (a === 0 && b === 0) return undefined;
  return a > 0 ? text('') : `${capital(bName)} ${formatSets(b)} sets vs ${aName} 0 sets`;
}
/** Weekly sets per muscle, classes and flags for one Analysis_Window (R26, R27). Pure. */
export function analyseSplit(input: SplitInput): SplitResult {
  const dates = new Set(windowDates(input.windowEnd));
  const inWindow = input.sessions.filter((s) => s.status === 'finished' && dates.has(input.toLocalDate(s.startedAt)));
  const weeklySets = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const days = new Map<string, Set<LocalDate>>();
  for (const session of inWindow) {
    const date = input.toLocalDate(session.startedAt);
    for (const entry of session.entries) {
      const ex = input.exercises.get(entry.exerciseId);
      if (ex === undefined) continue;
      const { primary, secondary } = muscleSets(ex);
      for (const set of entry.sets) {
        if (!isCompletedSet(set)) continue;
        for (const m of primary) {
          weeklySets[m as Muscle] += 1;
          if (TRACKED_SET.has(m)) days.set(m, (days.get(m) ?? new Set()).add(date));
        }
        for (const m of secondary) weeklySets[m as Muscle] += 0.5;
      }
    }
  }
  const classes = Object.fromEntries(MUSCLES.map((m) => [m, classify(weeklySets[m])])) as Record<Muscle, SplitClass>;
  const frequency = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, days.get(m)?.size ?? 0])) as Record<TrackedMuscle, number>;
  const result: SplitResult = { weeklySets, classes, frequency, sessionCount: inWindow.length, flags: [] };
  if (inWindow.length === 0) return { ...result, emptyMessage: EMPTY_SPLIT_MESSAGE };
  const flags: SplitFlag[] = [];
  for (const m of TRACKED_MUSCLES) if (weeklySets[m] === 0) flags.push({ type: 'untrained', muscle: m, message: `${capital(m)}: 0 sets this week` });
  const push = weeklySets.chest + weeklySets.shoulders + weeklySets.triceps;
  const pull = weeklySets.lats + weeklySets['middle back'] + weeklySets.biceps;
  const pushPull = pairFlag(['push', push], ['pull', pull]);
  if (pushPull !== undefined) flags.push({ type: 'pushPull', message: pushPull });
  const quadHam = pairFlag(['quadriceps', weeklySets.quadriceps], ['hamstrings', weeklySets.hamstrings]);
  if (quadHam !== undefined) flags.push({ type: 'quadHamstring', message: quadHam });
  for (const m of TRACKED_MUSCLES) {
    if (weeklySets[m] >= 1 && frequency[m] === 1) flags.push({ type: 'onceAWeek', muscle: m, message: `${capital(m)}: ${formatSets(weeklySets[m])} sets, trained on 1 day` });
  }
  return { ...result, flags };
}
