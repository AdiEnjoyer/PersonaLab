import { PR_E1RM_TOLERANCE_KG } from '../constants';
import type { Session } from '../types';
import { e1rm, isCompletedSet } from './metrics';

export type PrType = 'weight' | 'e1rm' | 'reps';

export interface PrInput {
  setId: string;
  weight: number;
  reps: number;
  completedAt: number;
  sessionStartedAt: number;
  position: number;
}

/** Total order of R24.1: completion time, session start, set position, then set id for determinism. */
export function completionOrder(a: PrInput, b: PrInput): number {
  return (
    a.completedAt - b.completedAt ||
    a.sessionStartedAt - b.sessionStartedAt ||
    a.position - b.position ||
    (a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0)
  );
}

/** What the prior sets P tell the detector. */
export interface PriorStats {
  count: number;
  maxWeight: number;
  /** Unrounded. */
  maxE1rm: number;
  /** Largest reps among prior sets with weight >= `weight`; undefined when there is none. */
  maxRepsAtOrAbove(weight: number): number | undefined;
}

/** Stats of an explicit list of prior sets (used for incremental evaluation). */
export function statsOf(prior: readonly PrInput[]): PriorStats {
  let maxWeight = -Infinity;
  let maxE = -Infinity;
  for (const p of prior) {
    maxWeight = Math.max(maxWeight, p.weight);
    maxE = Math.max(maxE, e1rm(p.weight, p.reps));
  }
  return {
    count: prior.length,
    maxWeight,
    maxE1rm: maxE,
    maxRepsAtOrAbove(weight) {
      let best: number | undefined;
      for (const p of prior) if (p.weight >= weight && (best === undefined || p.reps > best)) best = p.reps;
      return best;
    },
  };
}

/** R24.2 to R24.6, R24.12. An empty P gives no PR. */
export function evaluateAgainst(prior: PriorStats, s: PrInput): PrType[] {
  if (prior.count === 0) return [];
  const types: PrType[] = [];
  if (s.weight > prior.maxWeight) types.push('weight');
  if (e1rm(s.weight, s.reps) - prior.maxE1rm > PR_E1RM_TOLERANCE_KG) types.push('e1rm');
  const m = prior.maxRepsAtOrAbove(s.weight);
  if (m !== undefined && s.reps > m) types.push('reps');
  return types;
}

/** One pass over the history in completion order; the order of `history` does not matter. */
export function detectPrs(history: readonly PrInput[]): Map<string, PrType[]> {
  const sorted = [...history].sort(completionOrder);
  // Max-Fenwick over distinct weights in descending order: a prefix query covers weights >= w.
  const weights = [...new Set(sorted.map((s) => s.weight))].sort((a, b) => b - a);
  const rank = new Map(weights.map((w, i) => [w, i + 1]));
  const tree = new Array<number>(weights.length + 1).fill(-1);
  const update = (i: number, reps: number) => {
    for (; i <= weights.length; i += i & -i) if (tree[i]! < reps) tree[i] = reps;
  };
  const query = (i: number): number => {
    let best = -1;
    for (; i > 0; i -= i & -i) if (tree[i]! > best) best = tree[i]!;
    return best;
  };
  let count = 0;
  let maxWeight = -Infinity;
  let maxE = -Infinity;
  const marks = new Map<string, PrType[]>();
  for (const s of sorted) {
    const stats: PriorStats = {
      count,
      maxWeight,
      maxE1rm: maxE,
      maxRepsAtOrAbove: (w) => {
        const best = query(rank.get(w) ?? 0);
        return best < 0 ? undefined : best;
      },
    };
    marks.set(s.setId, evaluateAgainst(stats, s));
    count += 1;
    maxWeight = Math.max(maxWeight, s.weight);
    maxE = Math.max(maxE, e1rm(s.weight, s.reps));
    update(rank.get(s.weight)!, s.reps);
  }
  return marks;
}

/**
 * Completed_Sets of one exercise in Finished and Active Sessions as detector input. `position` is the index
 * of the Set in its Session's flattened set order.
 */
export function prInputsForExercise(sessions: readonly Session[], exerciseId: string): PrInput[] {
  const out: PrInput[] = [];
  for (const session of sessions) {
    let position = 0;
    for (const entry of session.entries) {
      for (const s of entry.sets) {
        if (entry.exerciseId === exerciseId && isCompletedSet(s)) {
          out.push({
            setId: s.id,
            weight: s.weight,
            reps: s.reps,
            completedAt: s.completedAt ?? session.startedAt,
            sessionStartedAt: session.startedAt,
            position,
          });
        }
        position += 1;
      }
    }
  }
  return out;
}

/** PR marks of every Completed_Set of `exerciseId`, recomputed from the full history (R24.8). Never stored. */
export function prMarksForExercise(sessions: readonly Session[], exerciseId: string): Map<string, PrType[]> {
  return detectPrs(prInputsForExercise(sessions, exerciseId));
}

export const PR_LABELS: Record<PrType, string> = { weight: 'Weight PR', e1rm: 'E1RM PR', reps: 'Rep PR' };
