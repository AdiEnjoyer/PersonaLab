// Feature: personal-lab, Property 137: SM-2 reset
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sm2Review } from '../sm2';

const validState = fc
  .record({ E: fc.integer({ min: 130, max: 400 }), n: fc.integer({ min: 0, max: 20 }), I: fc.integer({ min: 1, max: 36_500 }) })
  .map((s) => (s.n === 0 ? { ...s, I: 0 } : s));

describe('Property 137: SM-2 reset', () => {
  it('a failed review keeps EF, sets n to 0 and the interval to 1 day', () => {
    fc.assert(
      fc.property(validState, fc.integer({ min: 0, max: 2 }), (s, q) => {
        const next = sm2Review(s, q, '2025-06-01');
        expect(next.E).toBe(s.E);
        expect(next.n).toBe(0);
        expect(next.I).toBe(1);
        expect(next.due).toBe('2025-06-02');
      }),
      { numRuns: 300 },
    );
  }, 60_000);
});
