import { describe, it } from 'vitest';
import fc from 'fast-check';
import { round } from '../round';
import { roundDecimalOracle } from '../../../test/oracles/roundHalfAwayFromZero';

const MAX_ABS = 1_000_000_000_000; // ≤ 13 significant digits, so n / 10^p is the nearest double to the decimal

/** Integers, with extra weight on values that end in 5 (exact halves after rounding). */
const arbMantissa = fc.oneof(
  fc.integer({ min: -MAX_ABS, max: MAX_ABS }),
  fc.integer({ min: -MAX_ABS / 10, max: MAX_ABS / 10 }).map((k) => k * 10 + (k < 0 ? -5 : 5)),
  fc.integer({ min: -1000, max: 1000 }),
);

/** A decimal with up to 6 fractional digits, as an integer and a power of ten. */
const arbDecimal = fc.oneof(
  { weight: 20, arbitrary: fc.record({ n: arbMantissa, p: fc.integer({ min: 0, max: 6 }) }) },
  // Known float traps: 1.005, −2.5, 1.45, 8.345, −0.005
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      { n: 1005, p: 3 },
      { n: -25, p: 1 },
      { n: 145, p: 2 },
      { n: 8345, p: 3 },
      { n: -5, p: 3 },
    ),
  },
);

describe('round', () => {
  it('matches exact BigInt half-away-from-zero rounding', () => {
    // Feature: personal-lab, Property 31: Rounding is half away from zero
    fc.assert(
      fc.property(arbDecimal, fc.integer({ min: 0, max: 3 }), ({ n, p }, d) => {
        const x = n / 10 ** p;
        const expected = Number(roundDecimalOracle(BigInt(n), p, d));
        return Object.is(round(x, d), expected);
      }),
      { numRuns: 1000 },
    );
  });
});
