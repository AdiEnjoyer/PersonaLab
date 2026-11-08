// Feature: personal-lab, Property 142: Win_Probability formula
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { winProb } from '../winProb';

describe('winProb', () => {
  it('is 50 at 0 and symmetric, bounded and strictly increasing on integer cp', () => {
    expect(winProb(0)).toBe(50);
    fc.assert(
      fc.property(fc.integer({ min: -5000, max: 5000 }), (cp) => {
        const w = winProb(cp);
        expect(Math.abs(winProb(-cp) - (100 - w))).toBeLessThanOrEqual(1e-9);
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThan(100);
        if (cp <= 4999) expect(winProb(cp + 1)).toBeGreaterThan(w);
      }),
      { numRuns: 300 },
    );
  }, 30_000);

  it('stays within 0–100 for any finite double', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (cp) => {
        const w = winProb(cp);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(100);
      }),
      { numRuns: 300 },
    );
  }, 30_000);
});
