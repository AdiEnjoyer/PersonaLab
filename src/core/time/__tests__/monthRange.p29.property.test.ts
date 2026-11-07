import { describe, it } from 'vitest';
import fc from 'fast-check';
import { monthsBack } from '../monthRange';
import { arbLocalDate } from '../../../test/arbitraries/core';

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const lastDay = (y: number, m: number): number => (m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1]!);

const parts = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return { y, m, day };
};

/** Month ends and the 28th–31st are where the clamping rule matters, so weight them. */
const arbToday = fc.oneof(
  arbLocalDate,
  fc
    .record({ y: fc.integer({ min: 2020, max: 2035 }), m: fc.integer({ min: 1, max: 12 }), back: fc.integer({ min: 0, max: 3 }) })
    .map(({ y, m, back }) => `${y}-${String(m).padStart(2, '0')}-${String(lastDay(y, m) - back).padStart(2, '0')}`),
);

describe('monthsBack', () => {
  it('lands n calendar months back on the same day or that month’s last day, never after today', () => {
    // Feature: personal-lab, Property 29: Month ranges
    fc.assert(
      fc.property(arbToday, fc.constantFrom(1, 3, 6, 12), (today, n) => {
        const t = parts(today);
        const r = parts(monthsBack(today, n));
        const monthsApart = (t.y * 12 + t.m) - (r.y * 12 + r.m);
        const expectedDay = Math.min(t.day, lastDay(r.y, r.m));
        return monthsApart === n && r.day === expectedDay && monthsBack(today, n) <= today;
      }),
      { numRuns: 1000 },
    );
  });
});
