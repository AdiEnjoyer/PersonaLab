// Feature: personal-lab, Property 75: Protein target bounds
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { proteinTarget } from '../targets';

describe('Property 75', () => {
  it('target = round(W x factor) and target / W stays within the factor bounds widened by 0.5 / W', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 3000 }).map((n) => n / 10),
        fc.integer({ min: 16, max: 22 }).map((n) => n / 10),
        (w, factor) => {
          const t = proteinTarget(w, factor);
          expect(Number.isInteger(t)).toBe(true);
          expect(Math.abs(t - w * factor)).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(t / w).toBeGreaterThanOrEqual(1.6 - 0.5 / w - 1e-12);
          expect(t / w).toBeLessThanOrEqual(2.2 + 0.5 / w + 1e-12);
        },
      ),
      { numRuns: 500 },
    );
  }, 60_000);
});