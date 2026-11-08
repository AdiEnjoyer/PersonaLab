import { CLASS_THRESHOLDS } from '../../constants';
import type { StoredEval } from '../../types';
import { winProbOf } from './winProb';

export type MoveLabel = 'inaccuracy' | 'mistake' | 'blunder' | null;

/** Drop in the mover's win probability: max(0, W(before) − (100 − W(after))) (R56.3). `after` is from the opponent's view. */
export function drop(before: StoredEval, after: StoredEval): number {
  return Math.max(0, winProbOf(before) - (100 - winProbOf(after)));
}

/** Label for an unrounded drop (R56.4). */
export function labelFor(d: number): MoveLabel {
  if (d >= CLASS_THRESHOLDS.blunder) return 'blunder';
  if (d >= CLASS_THRESHOLDS.mistake) return 'mistake';
  if (d >= CLASS_THRESHOLDS.inaccuracy) return 'inaccuracy';
  return null;
}

/** 0 for no label, 1 inaccuracy, 2 mistake, 3 blunder. */
export function severity(label: MoveLabel): 0 | 1 | 2 | 3 {
  return label === 'blunder' ? 3 : label === 'mistake' ? 2 : label === 'inaccuracy' ? 1 : 0;
}

export type Classification = { evaluated: false } | { evaluated: true; drop: number; label: MoveLabel };

/** Same origin, target and promotion piece (R56.5). */
const sameMove = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Classifies one move. A missing evaluation gives "not evaluated" (R56.6); the engine's own best move is never labelled (R56.5).
 * Reports use this for the Owner's moves only.
 */
export function classifyMove(
  before: (StoredEval & { bestUci?: string | undefined }) | undefined,
  after: StoredEval | undefined,
  playedUci?: string,
): Classification {
  if (before === undefined || after === undefined) return { evaluated: false };
  const d = drop(before, after);
  if (playedUci !== undefined && before.bestUci !== undefined && sameMove(playedUci, before.bestUci)) return { evaluated: true, drop: d, label: null };
  return { evaluated: true, drop: d, label: labelFor(d) };
}
