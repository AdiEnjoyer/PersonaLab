// Feature: personal-lab, Property 143: Labels are monotone in drop
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { StoredEval } from '../../../types';
import { classifyMove, drop, labelFor, severity } from '../classify';

const edge = [5, 10, 15].flatMap((t) => [t, t - 1e-9, t + 1e-9]);
const arbDrop = fc.oneof(fc.double({ min: 0, max: 100, noNaN: true }), fc.constantFrom(0, 100, ...edge));

const arbEval: fc.Arbitrary<StoredEval> = fc.oneof(
  fc.integer({ min: -5000, max: 5000 }).map((cp) => ({ kind: 'cp' as const, cp })),
  fc.integer({ min: 1, max: 30 }).chain((n) => fc.boolean().map((neg) => ({ kind: 'mate' as const, n: neg ? -n : n }))),
  fc.constant({ kind: 'mated' as const }),
  fc.constant({ kind: 'draw' as const }),
);

describe('move classification', () => {
  it('label severity is monotone in the drop, inclusive at 5/10/15, and no label below 5', () => {
    expect([labelFor(5), labelFor(10), labelFor(15)]).toEqual(['inaccuracy', 'mistake', 'blunder']);
    fc.assert(
      fc.property(arbDrop, arbDrop, (a, b) => {
        const [d1, d2] = a <= b ? [a, b] : [b, a];
        expect(severity(labelFor(d1))).toBeLessThanOrEqual(severity(labelFor(d2)));
        if (d1 < 5) expect(labelFor(d1)).toBeNull();
      }),
      { numRuns: 500 },
    );
  }, 30_000);

  it('the engine best move is never labelled and drops stay within 0–100', () => {
    fc.assert(
      fc.property(arbEval, arbEval, fc.constantFrom('e2e4', 'g1f3', 'e7e8q'), (before, after, uci) => {
        const d = drop(before, after);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(100);
        const best = classifyMove({ ...before, bestUci: uci }, after, uci);
        expect(best).toEqual({ evaluated: true, drop: d, label: null });
        const other = classifyMove({ ...before, bestUci: uci }, after, 'a2a3');
        expect(other.evaluated && other.label === null ? other.drop < 5 : true).toBe(true);
        expect(classifyMove(undefined, after, uci)).toEqual({ evaluated: false });
        expect(classifyMove({ ...before, bestUci: uci }, undefined, uci)).toEqual({ evaluated: false });
      }),
      { numRuns: 300 },
    );
  }, 30_000);
});
