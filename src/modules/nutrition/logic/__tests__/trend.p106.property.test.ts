// Feature: personal-lab, Property 106: Corrected burn metamorphic relations
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { correctedBurn } from '../trend';

const arbDelta = fc.integer({ min: -2000, max: 2000 }).map((n) => n / 100); // kg, 2 decimals

describe('Property 106', () => {
  it('C strictly decreases in dW and adding k to I adds exactly k to C', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 14, max: 28 }),
        fc.integer({ min: 0, max: 100_000 }).map((n) => n / 10),
        arbDelta,
        arbDelta,
        fc.integer({ min: -3000, max: 3000 }),
        (L, I, a, b, k) => {
          fc.pre(a !== b);
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const D = L - 7;
          expect(correctedBurn(I, lo, D)).toBeGreaterThan(correctedBurn(I, hi, D));
          expect(Math.abs(correctedBurn(I + k, lo, D) - correctedBurn(I, lo, D) - k)).toBeLessThan(1e-9);
        },
      ),
      { numRuns: 300 },
    );
  }, 60_000);
});