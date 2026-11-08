// Feature: personal-lab, Property 125: Glicko-2 direction
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { glicko2 } from '../glicko2';

const player = fc.record({
  rating: fc.double({ min: 100, max: 3000, noNaN: true }),
  rd: fc.double({ min: 60, max: 350, noNaN: true }),
  vol: fc.double({ min: 0.03, max: 0.1, noNaN: true }),
});
const opponent = fc.record({ rating: fc.double({ min: 100, max: 3000, noNaN: true }), rd: fc.double({ min: 30, max: 500, noNaN: true }) });

describe('Property 125: Glicko-2 direction', () => {
  it('a win raises the rating and a loss lowers it', () => {
    fc.assert(
      fc.property(player, opponent, (p, o) => {
        expect(glicko2(p, [{ ...o, score: 1 }]).rating).toBeGreaterThan(p.rating);
        expect(glicko2(p, [{ ...o, score: 0 }]).rating).toBeLessThan(p.rating);
      }),
      { numRuns: 500 },
    );
  }, 60_000);
});
