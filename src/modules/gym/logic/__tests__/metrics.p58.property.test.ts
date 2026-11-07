// Feature: personal-lab, Property 58: E1RM formula and monotonicity
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { e1rm } from '../metrics';

const arbWeight = fc.integer({ min: 0, max: 100_000 }).map((n) => n / 100);
const arbReps = fc.integer({ min: 1, max: 100 });

describe('Property 58', () => {
  it('matches the formula, is at least the weight, and is monotone in weight and reps', () => {
    fc.assert(
      fc.property(arbWeight, arbWeight, arbReps, arbReps, (w1, w2, r1, r2) => {
        expect(e1rm(w1, 1)).toBe(w1);
        expect(e1rm(w1, Math.max(r1, 2))).toBe(w1 * (1 + Math.max(r1, 2) / 30));
        expect(e1rm(w1, r1)).toBeGreaterThanOrEqual(w1);
        expect(e1rm(0, r1)).toBe(0);
        const [wLo, wHi] = w1 <= w2 ? [w1, w2] : [w2, w1];
        const [rLo, rHi] = r1 <= r2 ? [r1, r2] : [r2, r1];
        expect(e1rm(wLo, r1)).toBeLessThanOrEqual(e1rm(wHi, r1));
        expect(e1rm(w1, rLo)).toBeLessThanOrEqual(e1rm(w1, rHi));
      }),
      { numRuns: 500 },
    );
  }, 60_000);
});
