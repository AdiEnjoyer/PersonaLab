// Feature: personal-lab, Property 66: Weekly sets are conserved
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MUSCLES } from '../../constants';
import type { Session } from '../../types';
import { analyseSplit } from '../split';
const exercises = new Map([
  ['a', { primaryMuscles: ['chest', 'chest', 'bogus'], secondaryMuscles: ['triceps', 'chest', 'shoulders', 'triceps'] }],
  ['b', { primaryMuscles: ['quadriceps', 'glutes'], secondaryMuscles: ['hamstrings', 'glutes', 'calves'] }],
  ['c', { primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'nope'] }],
]);
const distinct = (xs: string[]) => [...new Set(xs.filter((m) => (MUSCLES as readonly string[]).includes(m)))];
const arbSet = fc.record({ weight: fc.constantFrom(0, 20, 60.5), reps: fc.integer({ min: 1, max: 12 }), done: fc.boolean() });
const arbSession = fc.record({
  day: fc.integer({ min: 0, max: 9 }),
  status: fc.constantFrom<'finished' | 'active'>('finished', 'finished', 'active'),
  entries: fc.array(fc.record({ exerciseId: fc.constantFrom('a', 'b', 'c', 'missing'), sets: fc.array(arbSet, { maxLength: 6 }) }), { maxLength: 5 }),
});
type GenSession = typeof arbSession extends fc.Arbitrary<infer T> ? T : never;
const WINDOW_END = '2025-03-10';
const toLocalDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const build = (xs: GenSession[]): Session[] =>
  xs.map((x, i) => ({
    id: `s${i}`,
    status: x.status,
    startedAt: Date.UTC(2025, 2, 1 + x.day, 12),
    ...(x.status === 'finished' ? { finishedAt: Date.UTC(2025, 2, 1 + x.day, 13) } : {}),
    lastChangeAt: 1,
    entries: x.entries.map((e, j) => ({
      entryId: `e${i}-${j}`,
      exerciseId: e.exerciseId,
      sets: e.sets.map((s, k) => ({ id: `t${i}-${j}-${k}`, idemKey: `t${i}-${j}-${k}`, weight: s.weight, reps: s.reps, weightSource: 'owner' as const, repsSource: 'owner' as const, completed: s.done, ...(s.done ? { completedAt: 1 } : {}) })),
    })),
  }));describe('Property 66', () => {
  it('total weekly sets equal the sum over completed sets of primaries + 0.5 x secondaries', () => {
    fc.assert(
      fc.property(fc.array(arbSession, { maxLength: 8 }), (xs) => {
        const sessions = build(xs);
        const result = analyseSplit({ sessions, exercises, windowEnd: WINDOW_END, toLocalDate });
        // Window is 2025-03-04 .. 2025-03-10 (days 3..9 of the generator).
        let expected = 0;
        for (const s of sessions) {
          if (s.status !== 'finished' || toLocalDate(s.startedAt) < '2025-03-04' || toLocalDate(s.startedAt) > WINDOW_END) continue;
          for (const e of s.entries) {
            const ex = exercises.get(e.exerciseId);
            if (ex === undefined) continue;
            const primary = distinct(ex.primaryMuscles);
            const secondary = distinct(ex.secondaryMuscles).filter((m) => !primary.includes(m));
            expected += e.sets.filter((x) => x.completed).length * (primary.length + 0.5 * secondary.length);
          }
        }
        expect(Object.values(result.weeklySets).reduce((a, b) => a + b, 0)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  }, 60_000);
});