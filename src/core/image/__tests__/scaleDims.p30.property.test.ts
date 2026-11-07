import { describe, it } from 'vitest';
import fc from 'fast-check';
import { scaleDims } from '../processImage';

const arbSide = fc.oneof(
  fc.integer({ min: 1, max: 10_000 }),
  // Sizes at and around the limits, where off-by-one errors live
  fc.constantFrom(1, 255, 256, 257, 599, 600, 601, 1023, 1024, 1025, 2048, 10_000),
);

describe('scaleDims', () => {
  it('keeps small images and scales large ones to the limit with the aspect ratio kept', () => {
    // Feature: personal-lab, Property 30: Image scaling dimensions
    fc.assert(
      fc.property(arbSide, arbSide, fc.constantFrom(256, 600, 1024), (w, h, m) => {
        const out = scaleDims(w, h, m);
        const long = Math.max(w, h);
        const short = Math.min(w, h);
        if (long <= m) return out.width === w && out.height === h;

        // round(short × m / long), half away from zero, in exact integer arithmetic
        const expectedShort = Math.floor((2 * short * m + long) / (2 * long));
        const outLong = w >= h ? out.width : out.height;
        const outShort = w >= h ? out.height : out.width;
        const withinOnePx = Math.abs(outShort * long - short * m) <= long;
        return outLong === m && outShort === expectedShort && withinOnePx;
      }),
      { numRuns: 1000 },
    );
  });
});
