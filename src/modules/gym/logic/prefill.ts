import type { Session } from '../types';
import { formatWeightReps } from './format';
import { completedSetsOf, type CompletedSet } from './metrics';

/**
 * The Completed_Sets (in logged order) of `exerciseId` in the Finished Session with the latest finish time
 * that has at least one of them (R19.2). Equal finish times fall back to the later start, then the id.
 */
export function referenceSets(exerciseId: string, finished: readonly Session[]): CompletedSet[] | undefined {
  let best: { session: Session; sets: CompletedSet[] } | undefined;
  for (const session of finished) {
    if (session.status !== 'finished' || session.finishedAt === undefined) continue;
    const sets = completedSetsOf(session, exerciseId);
    if (sets.length === 0) continue;
    if (best === undefined || isLater(session, best.session)) best = { session, sets };
  }
  return best?.sets;
}

function isLater(a: Session, b: Session): boolean {
  if (a.finishedAt !== b.finishedAt) return (a.finishedAt as number) > (b.finishedAt as number);
  if (a.startedAt !== b.startedAt) return a.startedAt > b.startedAt;
  return a.id > b.id;
}

/** Pre-fill of the n-th (1-based) draft row (R19.2 to R19.4). */
export function prefillFor(n: number, ref: readonly CompletedSet[] | undefined, routineRepMin?: number): { weight?: number; reps?: number } {
  if (ref !== undefined && ref.length > 0) {
    const s = ref[n - 1] ?? ref[ref.length - 1]!;
    return { weight: s.weight, reps: s.reps };
  }
  return routineRepMin === undefined ? {} : { reps: routineRepMin };
}

/** The "previous" label next to the n-th row: "<w> kg × <r>" or a dash (R19.6). */
export function previousLabel(n: number, ref: readonly CompletedSet[] | undefined): string {
  const s = ref?.[n - 1];
  return s === undefined ? '—' : formatWeightReps(s.weight, s.reps);
}
