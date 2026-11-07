// Feature: personal-lab, Property 62: Incremental and one-pass PR marks agree
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { completionOrder, detectPrs, evaluateAgainst, statsOf, type PrInput } from '../pr';

const arbHistory = fc
  .array(
    fc.record({
      weight: fc.constantFrom(0, 20, 20.25, 40, 40, 60, 60, 100, 100.5, 1000),
      reps: fc.constantFrom(1, 1, 2, 5, 5, 8, 8, 12, 30, 100),
      completedAt: fc.integer({ min: 1, max: 8 }),
      sessionStartedAt: fc.integer({ min: 0, max: 3 }),
      position: fc.integer({ min: 0, max: 10 }),
    }),
    { minLength: 1, maxLength: 40 },
  )
  .map((xs): PrInput[] => xs.map((x, i) => ({ setId: `s${String(i).padStart(3, '0')}`, ...x })));

describe('Property 62', () => {
  it('incremental evaluation in completion order equals the one-pass result for every input order', () => {
    fc.assert(
      fc.property(arbHistory, fc.nat(), (history, seed) => {
        const onePass = detectPrs(history);
        const ordered = [...history].sort(completionOrder);
        const incremental = new Map<string, string[]>();
        ordered.forEach((s, i) => incremental.set(s.setId, evaluateAgainst(statsOf(ordered.slice(0, i)), s)));
        expect(onePass).toEqual(incremental);
        // A rotated and reversed input gives the same marks.
        const k = seed % history.length;
        const shuffled = [...history.slice(k), ...history.slice(0, k)].reverse();
        expect(detectPrs(shuffled)).toEqual(onePass);
      }),
      { numRuns: 300 },
    );
  }, 60_000);

  it('the maximum weight is the first set weight or a weight PR (metamorphic)', () => {
    fc.assert(
      fc.property(arbHistory, (history) => {
        const marks = detectPrs(history);
        const ordered = [...history].sort(completionOrder);
        const max = Math.max(...ordered.map((s) => s.weight));
        expect(max === ordered[0]!.weight || ordered.some((s) => s.weight === max && marks.get(s.setId)!.includes('weight'))).toBe(true);
      }),
      { numRuns: 200 },
    );
  }, 60_000);
});
