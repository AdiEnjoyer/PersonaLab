// Feature: personal-lab, Property 61: PR detection matches the reference model
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { oraclePrs, type OracleSession } from '../../../../test/oracles/gymPr';
import type { Session } from '../../types';
import { prMarksForExercise } from '../pr';

const arbSet = fc.record({
  weight: fc.option(fc.constantFrom(0, 20, 20.25, 40, 40, 60, 60, 100, 100.5, 1000, 1001, -5, Number.NaN), { nil: undefined }),
  reps: fc.option(fc.constantFrom(0, 1, 1, 2, 5, 5, 8, 8, 12, 100, 101, 2.5), { nil: undefined }),
  completed: fc.boolean(),
  completedAt: fc.integer({ min: 1, max: 6 }),
});

const arbSession = fc.record({
  startedAt: fc.integer({ min: 0, max: 3 }),
  otherRows: fc.integer({ min: 0, max: 2 }),
  sets: fc.array(arbSet, { minLength: 0, maxLength: 8 }),
});

function build(raw: Array<{ startedAt: number; otherRows: number; sets: Array<{ weight?: number | undefined; reps?: number | undefined; completed: boolean; completedAt: number }> }>) {
  let n = 0;
  const oracleSessions: OracleSession[] = [];
  const sessions: Session[] = raw.map((r, si) => {
    const sets = r.sets.map((s) => {
      n += 1;
      return { id: `s${n}`, ...s };
    });
    oracleSessions.push({ startedAt: r.startedAt, otherRows: r.otherRows, sets });
    return {
      id: `session${si}`,
      status: 'finished',
      startedAt: r.startedAt,
      finishedAt: r.startedAt + 1,
      lastChangeAt: 0,
      entries: [
        { entryId: `o${si}`, exerciseId: 'other', sets: Array.from({ length: r.otherRows }, (_, k) => ({ id: `o${si}-${k}`, idemKey: 'k', weight: 500, reps: 50, weightSource: 'owner', repsSource: 'owner', completed: true, completedAt: 1 })) },
        {
          entryId: `e${si}`,
          exerciseId: 'x',
          sets: sets.map((s) => ({
            id: s.id,
            idemKey: 'k',
            ...(s.weight === undefined ? {} : { weight: s.weight }),
            ...(s.reps === undefined ? {} : { reps: s.reps }),
            weightSource: 'owner',
            repsSource: 'owner',
            completed: s.completed,
            completedAt: s.completedAt,
          })),
        },
      ],
    } satisfies Session;
  });
  return { sessions, oracleSessions };
}

describe('Property 61', () => {
  it('detectPrs on session data equals the naive reference', () => {
    fc.assert(
      fc.property(fc.array(arbSession, { minLength: 0, maxLength: 5 }), (raw) => {
        const { sessions, oracleSessions } = build(raw);
        expect(prMarksForExercise(sessions, 'x')).toEqual(oraclePrs(oracleSessions));
      }),
      { numRuns: 300 },
    );
  }, 60_000);
});
