// Feature: personal-lab, Property 67: Split analysis is order-independent
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Session } from '../../types';
import { analyseSplit } from '../split';
const exercises = new Map([
  ['a', { primaryMuscles: ['chest', 'chest', 'bogus'], secondaryMuscles: ['triceps', 'chest', 'shoulders', 'triceps'] }],
  ['b', { primaryMuscles: ['quadriceps', 'glutes'], secondaryMuscles: ['hamstrings', 'glutes', 'calves'] }],
  ['c', { primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'nope'] }],
]);
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
  }));describe('Property 67', () => {
  it('permuting sessions and sets leaves weekly sets and classes unchanged', () => {
    fc.assert(
      fc.property(fc.array(arbSession, { maxLength: 8 }), fc.nat(), (xs, seed) => {
        const sessions = build(xs);
        const rotate = <T,>(a: T[]) => (a.length === 0 ? a : [...a.slice(seed % a.length), ...a.slice(0, seed % a.length)].reverse());
        const permuted = rotate(sessions).map((s) => ({ ...s, entries: rotate(s.entries).map((e) => ({ ...e, sets: rotate(e.sets) })) }));
        const a = analyseSplit({ sessions, exercises, windowEnd: WINDOW_END, toLocalDate });
        const b = analyseSplit({ sessions: permuted, exercises, windowEnd: WINDOW_END, toLocalDate });
        expect(b.weeklySets).toEqual(a.weeklySets);
        expect(b.classes).toEqual(a.classes);
        expect(b.sessionCount).toBe(a.sessionCount);
      }),
      { numRuns: 200 },
    );
  }, 60_000);
});