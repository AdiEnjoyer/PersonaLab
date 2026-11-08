import { describe, expect, it } from 'vitest';
import { displayRating, glicko2, initialPuzzleRating, isProvisional } from '../glicko2';

describe('glicko2', () => {
  it('matches the reference example of Glickman’s paper (R49.5)', () => {
    const r = glicko2({ rating: 1500, rd: 200, vol: 0.06 }, [
      { rating: 1400, rd: 30, score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ]);
    expect(Math.abs(r.rating - 1464.06)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.rd - 151.52)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.vol - 0.05999)).toBeLessThanOrEqual(0.00001);
  });

  it('initialises from the Chess_Rating and labels a wide deviation provisional (R49.2, R49.8)', () => {
    expect(initialPuzzleRating(1234)).toEqual({ rating: 1234, rd: 350, vol: 0.06 });
    expect(isProvisional(110.01)).toBe(true);
    expect(isProvisional(110)).toBe(false);
    expect(displayRating(1234.5)).toBe(1235);
  });
});
