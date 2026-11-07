import type { Session } from '../types';
import { completedSetsOf, isCompletedSet, exerciseVolume, sessionDurationMs, sessionVolume, topSet, volumeChange, type CompletedSet, type VolumeChange } from './metrics';
import { prMarksForExercise, type PrType } from './pr';
export interface ExerciseSummary {
  exerciseId: string;
  topSet: CompletedSet;
  volume: number;
  change: VolumeChange;
}
export interface PrSummary {
  exerciseId: string;
  set: CompletedSet;
  types: PrType[];
}
export interface FinishSummary {
  durationMs: number;
  completedSets: number;
  totalVolume: number;
  exercises: ExerciseSummary[];
  prs: PrSummary[];
}
/** Exercise ids with at least one Completed_Set, in Session order, each once. */
export function exerciseIdsInOrder(session: Session): string[] {
  const ids: string[] = [];
  for (const e of session.entries) if (!ids.includes(e.exerciseId) && completedSetsOf(session, e.exerciseId).length > 0) ids.push(e.exerciseId);
  return ids;
}
/** The most recent Finished Session that started earlier and has a Completed_Set of the exercise (R22.8). */
function previousSession(session: Session, exerciseId: string, others: readonly Session[]): Session | undefined {
  let best: Session | undefined;
  for (const o of others) {
    if (o.id === session.id || o.status !== 'finished' || o.startedAt >= session.startedAt) continue;
    if (completedSetsOf(o, exerciseId).length === 0) continue;
    if (best === undefined || o.startedAt > best.startedAt) best = o;
  }
  return best;
}
/** Everything the finish summary shows (R22.5, R22.8). `finishedSession` is the Session that just finished. */
export function finishSummary(finishedSession: Session, allFinished: readonly Session[]): FinishSummary {
  const history = allFinished.some((s) => s.id === finishedSession.id) ? allFinished : [...allFinished, finishedSession];
  const exercises: ExerciseSummary[] = [];
  const prs: PrSummary[] = [];
  for (const exerciseId of exerciseIdsInOrder(finishedSession)) {
    const sets = completedSetsOf(finishedSession, exerciseId);
    const prev = previousSession(finishedSession, exerciseId, history);
    const volume = exerciseVolume(finishedSession, exerciseId);
    exercises.push({ exerciseId, topSet: topSet(sets)!, volume, change: volumeChange(volume, prev === undefined ? undefined : exerciseVolume(prev, exerciseId)) });
    const marks = prMarksForExercise(history, exerciseId);
    for (const set of sets) {
      const types = marks.get(set.id) ?? [];
      if (types.length > 0) prs.push({ exerciseId, set, types });
    }
  }
  return {
    durationMs: sessionDurationMs({ startedAt: finishedSession.startedAt, finishedAt: finishedSession.finishedAt ?? finishedSession.startedAt }),
    completedSets: finishedSession.entries.reduce((n, e) => n + e.sets.filter(isCompletedSet).length, 0),
    totalVolume: sessionVolume(finishedSession),
    exercises,
    prs,
  };
}
