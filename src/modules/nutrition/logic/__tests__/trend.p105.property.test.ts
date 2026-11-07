// Feature: personal-lab, Property 105: Zero weight change keeps intake
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { correctedBurn } from '../trend';

describe('Property 105', () => {
  it('correctedBurn(I, 0, L - 7) = I for L in 14..28', () => {
    fc.assert(
      fc.property(fc.integer({ min: 14, max: 28 }), fc.integer({ min: 1, max: 100_000 }).map((n) => n / 10), (L, I) => {
        expect(correctedBurn(I, 0, L - 7)).toBe(I);
      }),
      { numRuns: 200 },
    );
  }, 60_000);
});