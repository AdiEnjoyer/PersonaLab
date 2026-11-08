// Feature: personal-lab, Property 139: SM-2 intervals grow under passing reviews
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SRS_INITIAL, sm2Review, type SrsState } from '../sm2';

describe('Property 139: SM-2 intervals grow under passing reviews', () => {
  it('intervals never decrease and EF stays at or above 1.3 for q from 3 to 5', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 3, max: 5 }), { minLength: 1, maxLength: 50 }), (qs) => {
        let s: SrsState = SRS_INITIAL;
        let previous = 0;
        for (const q of qs) {
          s = sm2Review(s, q, '2025-06-01');
          expect(s.I).toBeGreaterThanOrEqual(previous);
          expect(s.E).toBeGreaterThanOrEqual(130);
          previous = s.I;
        }
      }),
      { numRuns: 300 },
    );
  }, 60_000);
});
