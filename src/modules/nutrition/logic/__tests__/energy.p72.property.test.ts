// Feature: personal-lab, Property 72: BMR metamorphic relations
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bmr } from '../energy';

const arbWeight = fc.integer({ min: 300, max: 2990 }).map((n) => n / 10); // 30.0 to 299.0 so +1 kg stays in range
const arbHeight = fc.integer({ min: 100, max: 249 });
const arbAge = fc.integer({ min: 13, max: 99 });

describe('Property 72', () => {
  it('+1 kg adds 10, +1 cm adds 6.25, +1 year subtracts 5, male exceeds female by 166', () => {
    fc.assert(
      fc.property(fc.constantFrom('male' as const, 'female' as const), arbWeight, arbHeight, arbAge, (sex, w, h, a) => {
        const base = bmr({ sex, heightCm: h, age: a }, w);
        expect(Math.abs(bmr({ sex, heightCm: h, age: a }, w + 1) - base - 10)).toBeLessThan(1e-9);
        expect(Math.abs(bmr({ sex, heightCm: h + 1, age: a }, w) - base - 6.25)).toBeLessThan(1e-9);
        expect(Math.abs(bmr({ sex, heightCm: h, age: a + 1 }, w) - base + 5)).toBeLessThan(1e-9);
        const male = bmr({ sex: 'male', heightCm: h, age: a }, w);
        const female = bmr({ sex: 'female', heightCm: h, age: a }, w);
        expect(Math.abs(male - female - 166)).toBeLessThan(1e-9);
      }),
      { numRuns: 300 },
    );
  }, 60_000);
});