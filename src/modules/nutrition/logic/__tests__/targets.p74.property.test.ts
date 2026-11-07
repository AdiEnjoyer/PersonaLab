// Feature: personal-lab, Property 74: Calorie floor
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calorieTarget } from '../targets';

/** Half away from zero for values that are multiples of 0.25 (exact in binary floating point). */
const oracleRound = (x: number) => Math.sign(x) * Math.floor(Math.abs(x) + 0.5);

describe('Property 74', () => {
  it('target = max(round(burn + adjust), floor); floored exactly when the rounded value is below the floor', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40_000 }).map((q) => q / 4), // 0 to 10 000 in quarter kcal
        fc.integer({ min: -20, max: 20 }).map((n) => n * 50),
        fc.constantFrom('male' as const, 'female' as const),
        (burn, adjust, sex) => {
          const floor = sex === 'male' ? 1500 : 1200;
          const rounded = oracleRound(burn + adjust);
          const r = calorieTarget(burn, adjust, sex);
          expect(Number.isInteger(r.kcal)).toBe(true);
          expect(r.kcal).toBe(Math.max(rounded, floor));
          expect(r.floored).toBe(rounded < floor);
        },
      ),
      { numRuns: 500 },
    );
  }, 60_000);
});