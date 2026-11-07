/**
 * Oracle for Properties 61 and 62: a naive O(n^2) PR reference for one exercise, written from R24 and
 * independent of production code. For each Completed_Set in completion order it compares against every
 * earlier Completed_Set.
 */
export interface OracleSet {
  id: string;
  weight?: number;
  reps?: number;
  completed: boolean;
  completedAt?: number;
}

export interface OracleSession {
  startedAt: number;
  /** Sets of the exercise under test, in row order; other exercises' rows are listed in `otherRows`. */
  sets: OracleSet[];
  /** Number of rows of other exercises placed before the sets (shifts positions only). */
  otherRows: number;
}

const epley = (w: number, r: number): number => (r === 1 ? w : w * (1 + r / 30));

const countsAsCompleted = (s: OracleSet): s is OracleSet & { weight: number; reps: number; completedAt: number } =>
  s.completed &&
  typeof s.weight === 'number' &&
  Number.isFinite(s.weight) &&
  s.weight >= 0 &&
  s.weight <= 1000 &&
  typeof s.reps === 'number' &&
  Number.isInteger(s.reps) &&
  s.reps >= 1 &&
  s.reps <= 100 &&
  typeof s.completedAt === 'number';

export function oraclePrs(sessions: OracleSession[]): Map<string, string[]> {
  const all: Array<{ id: string; w: number; r: number; at: number; start: number; pos: number }> = [];
  for (const session of sessions) {
    session.sets.forEach((s, i) => {
      if (countsAsCompleted(s)) all.push({ id: s.id, w: s.weight, r: s.reps, at: s.completedAt, start: session.startedAt, pos: session.otherRows + i });
    });
  }
  all.sort((a, b) => a.at - b.at || a.start - b.start || a.pos - b.pos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const result = new Map<string, string[]>();
  all.forEach((s, i) => {
    const prior = all.slice(0, i);
    const marks: string[] = [];
    if (prior.length > 0) {
      if (prior.every((p) => s.w > p.w)) marks.push('weight');
      if (prior.every((p) => epley(s.w, s.r) - epley(p.w, p.r) > 0.001)) marks.push('e1rm');
      const atOrAbove = prior.filter((p) => p.w >= s.w);
      if (atOrAbove.length > 0 && atOrAbove.every((p) => s.r > p.r)) marks.push('reps');
    }
    result.set(s.id, marks);
  });
  return result;
}
