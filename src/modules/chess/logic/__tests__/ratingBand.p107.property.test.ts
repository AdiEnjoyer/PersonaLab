// Feature: personal-lab, Property 107: Rating bands partition ratings
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { expect } from 'vitest';
import { RATING_BANDS } from '../../constants';
import { bandIndex, ratingBand } from '../ratingBand';

/** Inclusive bounds of each band, written out independently of the implementation. */
const BOUNDS: Record<string, [number, number]> = {
  'below 800': [-Infinity, 799],
  '800–999': [800, 999],
  '1000–1199': [1000, 1199],
  '1200–1399': [1200, 1399],
  '1400–1599': [1400, 1599],
  '1600–1799': [1600, 1799],
  '1800–1999': [1800, 1999],
  '2000 and above': [2000, Infinity],
};

describe('Property 107: rating bands', () => {
  it('maps every rating to exactly one band that contains it, non-decreasing in the rating', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), (r) => {
        const band = ratingBand(r);
        const [lo, hi] = BOUNDS[band]!;
        expect(RATING_BANDS).toContain(band);
        expect(r >= lo && r <= hi).toBe(true);
        expect(RATING_BANDS.filter((b) => r >= BOUNDS[b]![0] && r <= BOUNDS[b]![1])).toEqual([band]);
        if (r < 4000) expect(bandIndex(ratingBand(r + 1))).toBeGreaterThanOrEqual(bandIndex(band));
      }),
      { numRuns: 300 },
    );
  }, 60_000);
});
