import { describe, expect, it } from 'vitest';
import { isValidSrs, SRS_INITIAL, sm2Review, type SrsState } from '../sm2';

describe('sm2Review', () => {
  it('reproduces the reference example: three perfect reviews give 1, 6, 17 days and EF 2.6, 2.7, 2.8', () => {
    let s: SrsState = SRS_INITIAL;
    const seen: Array<[number, number]> = [];
    for (let i = 0; i < 3; i++) {
      s = sm2Review(s, 5, '2025-03-01');
      seen.push([s.I, s.E]);
    }
    expect(seen).toEqual([
      [1, 260],
      [6, 270],
      [17, 280],
    ]);
    expect(s.due).toBe('2025-03-18');
  });

  it('changes EF by +0.10, 0 and -0.14 for q = 5, 4, 3 and never below 1.30', () => {
    const base: SrsState = { E: 250, n: 3, I: 10 };
    expect([5, 4, 3].map((q) => sm2Review(base, q, '2025-01-01').E)).toEqual([260, 250, 236]);
    expect(sm2Review({ E: 131, n: 3, I: 10 }, 3, '2025-01-01').E).toBe(130);
  });

  it('rounds the interval up and uses EF before the update', () => {
    expect(sm2Review({ E: 251, n: 2, I: 7 }, 5, '2025-01-01').I).toBe(18); // 7 x 2.51 = 17.57
  });

  it('resets repetitions and interval after a failed review and keeps EF', () => {
    const s = sm2Review({ E: 200, n: 5, I: 40 }, 1, '2025-01-31');
    expect(s).toEqual({ E: 200, n: 0, I: 1, due: '2025-02-01' });
  });

  it('caps the interval at 36,500 days', () => {
    expect(sm2Review({ E: 400, n: 9, I: 36_500 }, 5, '2025-01-01').I).toBe(36_500);
  });

  it('throws on an invalid quality or state', () => {
    expect(() => sm2Review(SRS_INITIAL, 6, '2025-01-01')).toThrow();
    expect(() => sm2Review(SRS_INITIAL, 2.5, '2025-01-01')).toThrow();
    expect(() => sm2Review({ E: 120, n: 0, I: 0 }, 5, '2025-01-01')).toThrow();
    expect(isValidSrs({ E: 250, n: 1, I: 0 })).toBe(false);
  });
});
