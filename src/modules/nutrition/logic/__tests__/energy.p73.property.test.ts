// Feature: personal-lab, Property 73: TDEE is monotone in training hours
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { activityFactor } from '../energy';

describe('Property 73', () => {
  it('bmr x factor(h1) <= bmr x factor(h2) for h1 <= h2', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 500, max: 6000 }).map((n) => n + 0.25),
        fc.double({ min: 0, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 40, noNaN: true }),
        (bmr, x, y) => {
          const [h1, h2] = x <= y ? [x, y] : [y, x];
          expect(bmr * activityFactor(h1)).toBeLessThanOrEqual(bmr * activityFactor(h2));
        },
      ),
      { numRuns: 300 },
    );
  }, 60_000);
});