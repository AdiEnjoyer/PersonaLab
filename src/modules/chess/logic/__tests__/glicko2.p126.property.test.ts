// Feature: personal-lab, Property 126: Glicko-2 validity
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GLICKO } from '../../constants';
import { clampRd, glicko2, updatePuzzleRating } from '../glicko2';

const player = fc.record({
  rating: fc.double({ min: 100, max: 3000, noNaN: true }),
  rd: fc.double({ min: 60, max: 350, noNaN: true }),
  vol: fc.double({ min: 0.03, max: 0.1, noNaN: true }),
});
const opponent = fc.record({ rating: fc.double({ min: 100, max: 3000, noNaN: true }), rd: fc.double({ min: 30, max: 500, noNaN: true }) });

describe('Property 126: Glicko-2 validity', () => {
  it('returns finite values, a clamped deviation and converges within 100 iterations', () => {
    fc.assert(
      fc.property(player, opponent, fc.constantFrom<0 | 1>(0, 1), (p, o, score) => {
        const r = glicko2(p, [{ ...o, score }]);
        expect(Number.isFinite(r.rating)).toBe(true);
        expect(Number.isFinite(r.rd)).toBe(true);
        expect(r.vol).toBeGreaterThan(0);
        expect(Number.isFinite(r.vol)).toBe(true);
        expect(r.iterations).toBeLessThanOrEqual(GLICKO.MAX_ITER);
        const clamped = clampRd(r.rd);
        expect(clamped).toBeGreaterThanOrEqual(60);
        expect(clamped).toBeLessThanOrEqual(350);
        const updated = updatePuzzleRating(p, o, score);
        expect(updated.rd).toBeGreaterThanOrEqual(60);
        expect(updated.rd).toBeLessThanOrEqual(350);
      }),
      { numRuns: 500 },
    );
  }, 60_000);
});
