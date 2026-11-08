// Feature: personal-lab, Property 87: Portion identity, linearity, servings equivalence and non-negativity (Properties 87 to 90)
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scalePortion, scaleServings, type Per100 } from '../portion';

// 0 or at least 1e-3: subnormal doubles lose precision in any multiplication and are not nutrient values.
const value = fc.option(fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max: 1000, noNaN: true })), { nil: undefined });
const arbProduct: fc.Arbitrary<Per100> = fc
  .record({ kcal: value, protein: value, carbs: value, fat: value })
  .map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as Per100);
const KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;
const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y));

describe('Properties 87 to 90', () => {
  it('87: scaling 100 g is the identity and missing stays missing', () => {
    fc.assert(
      fc.property(arbProduct, (p) => {
        const s = scalePortion(p, 100);
        for (const k of KEYS) {
          if (p[k] === undefined) expect(k in s).toBe(false);
          else expect(close(s[k] as number, p[k])).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  }, 60_000);

  it('88: scaling is linear in grams', () => {
    fc.assert(
      fc.property(arbProduct, fc.integer({ min: 1, max: 4999 }), fc.integer({ min: 1, max: 4999 }), (p, a, b) => {
        fc.pre(a + b <= 5000);
        const whole = scalePortion(p, a + b);
        const x = scalePortion(p, a);
        const y = scalePortion(p, b);
        for (const k of KEYS) {
          if (p[k] === undefined) continue;
          expect(close(whole[k] as number, (x[k] as number) + (y[k] as number))).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  }, 60_000);

  it('89: s servings equal s x q grams', () => {
    fc.assert(
      fc.property(arbProduct, fc.integer({ min: 1, max: 80 }), fc.double({ min: 0.1, max: 5000, noNaN: true }), (p, quarters, q) => {
        const s = quarters / 4;
        fc.pre(s * q >= 1 && s * q <= 5000);
        const a = scaleServings(p, s, q);
        const b = scalePortion(p, s * q);
        for (const k of KEYS) {
          if (p[k] === undefined) expect(a[k]).toBeUndefined();
          else expect(close(a[k] as number, b[k] as number)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  }, 60_000);

  it('90: scaled values are finite and non-negative or missing', () => {
    fc.assert(
      fc.property(arbProduct, fc.integer({ min: 10, max: 50_000 }).map((n) => n / 10), (p, grams) => {
        const s = scalePortion(p, grams);
        for (const k of KEYS) {
          const v = s[k];
          if (v !== undefined) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          } else expect(p[k]).toBeUndefined();
        }
      }),
      { numRuns: 200 },
    );
  }, 60_000);
});
