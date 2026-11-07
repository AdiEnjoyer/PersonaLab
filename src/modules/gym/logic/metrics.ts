import { LIMITS } from '../constants';
import type { Session, SetRecord } from '../types';

/** A Set that counts in every calculation: valid, completed, reps >= 1 (R23.5). */
export type CompletedSet = SetRecord & { weight: number; reps: number; completed: true };

/** R23.10: weight is a finite number from 0 to 1000, reps an integer from 0 to 100. Absent values fail. */
export function isValidStoredSet(s: SetRecord): boolean {
  const { weight, reps } = s;
  return (
    typeof weight === 'number' &&
    Number.isFinite(weight) &&
    weight >= 0 &&
    weight <= LIMITS.WEIGHT_MAX &&
    typeof reps === 'number' &&
    Number.isInteger(reps) &&
    reps >= 0 &&
    reps <= LIMITS.REPS_MAX
  );
}

export function isCompletedSet(s: SetRecord): s is CompletedSet {
  return isValidStoredSet(s) && s.completed && (s.reps as number) >= 1;
}

/** Epley estimate, unrounded: exactly `w` for one rep (R23.1). */
export function e1rm(w: number, r: number): number {
  return r === 1 ? w : w * (1 + r / 30);
}

export const setVolume = (s: CompletedSet): number => s.weight * s.reps;

/** The Completed_Sets of `exerciseId` in `session`, in logged order (entry order, then row order). */
export function completedSetsOf(session: Session, exerciseId: string): CompletedSet[] {
  const out: CompletedSet[] = [];
  for (const entry of session.entries) {
    if (entry.exerciseId !== exerciseId) continue;
    for (const s of entry.sets) if (isCompletedSet(s)) out.push(s);
  }
  return out;
}

export const sumVolume = (sets: readonly CompletedSet[]): number => sets.reduce((sum, s) => sum + setVolume(s), 0);

export const exerciseVolume = (session: Session, exerciseId: string): number => sumVolume(completedSetsOf(session, exerciseId));

export function sessionVolume(session: Session): number {
  let total = 0;
  for (const entry of session.entries) for (const s of entry.sets) if (isCompletedSet(s)) total += setVolume(s);
  return total;
}

export function topWeight(session: Session, exerciseId: string): number | undefined {
  const sets = completedSetsOf(session, exerciseId);
  return sets.length === 0 ? undefined : Math.max(...sets.map((s) => s.weight));
}

export function bestE1rm(session: Session, exerciseId: string): number | undefined {
  const sets = completedSetsOf(session, exerciseId);
  return sets.length === 0 ? undefined : Math.max(...sets.map((s) => e1rm(s.weight, s.reps)));
}

/** Highest E1RM; a tie goes to the higher weight, then the earlier completion (R22.5). */
export function topSet(sets: readonly CompletedSet[]): CompletedSet | undefined {
  let best: CompletedSet | undefined;
  for (const s of sets) {
    if (best === undefined) {
      best = s;
      continue;
    }
    const a = e1rm(s.weight, s.reps);
    const b = e1rm(best.weight, best.reps);
    if (a > b || (a === b && (s.weight > best.weight || (s.weight === best.weight && (s.completedAt ?? Infinity) < (best.completedAt ?? Infinity))))) {
      best = s;
    }
  }
  return best;
}

export const sessionDurationMs = (s: { startedAt: number; finishedAt: number }): number => Math.max(0, s.finishedAt - s.startedAt);

export type VolumeChange = { kind: 'first' } | { kind: 'change'; deltaKg: number; pct?: number };

export function volumeChange(curr: number, prev: number | undefined): VolumeChange {
  if (prev === undefined) return { kind: 'first' };
  const deltaKg = curr - prev;
  return prev > 0 ? { kind: 'change', deltaKg, pct: (deltaKg / prev) * 100 } : { kind: 'change', deltaKg };
}
