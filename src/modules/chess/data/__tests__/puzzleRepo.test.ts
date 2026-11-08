import { beforeEach, describe, expect, it } from 'vitest';
import { withFreshDb } from '../../../../test/helpers/db';
import { initialPuzzleRating, updatePuzzleRating } from '../../logic/glicko2';
import { readPuzzleData, recordAttempt } from '../puzzleRepo';

const puzzle = { id: 'p1', rating: 1100, rd: 80 };

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

describe('recordAttempt', () => {
  it('initialises the rating from the Chess_Rating and stores attempt and rating together', async () => {
    const result = await recordAttempt({ puzzle, score: 1, hintsUsed: 0, idemKey: 'k1', chessRating: 1200, now: 5 });
    const expected = updatePuzzleRating(initialPuzzleRating(1200), puzzle, 1);
    expect(result.created).toBe(true);
    expect(result.attempt).toMatchObject({ puzzleId: 'p1', ts: 5, score: 1, rated: true, before: initialPuzzleRating(1200), after: expected });
    const data = await readPuzzleData();
    expect(data.attempts).toHaveLength(1);
    expect(data.rating).toEqual({ id: 'puzzle', ...expected });
  });

  it('stores a repeated idempotency key once and updates the rating once', async () => {
    await recordAttempt({ puzzle, score: 0, hintsUsed: 1, idemKey: 'k1', chessRating: 1200 });
    const rating = (await readPuzzleData()).rating;
    const again = await recordAttempt({ puzzle, score: 0, hintsUsed: 1, idemKey: 'k1', chessRating: 1200 });
    expect(again.created).toBe(false);
    expect(await readPuzzleData()).toMatchObject({ rating, attempts: [expect.objectContaining({ idemKey: 'k1' })] });
  });

  it('rates only the first attempt at a puzzle and ignores later Chess_Rating changes', async () => {
    await recordAttempt({ puzzle, score: 1, hintsUsed: 0, idemKey: 'k1', chessRating: 1200 });
    const rating = (await readPuzzleData()).rating;
    const second = await recordAttempt({ puzzle, score: 0, hintsUsed: 0, idemKey: 'k2', chessRating: 1800 });
    expect(second.attempt.rated).toBe(false);
    expect(second.attempt.before).toEqual(second.attempt.after);
    expect((await readPuzzleData()).rating).toEqual(rating);
    const other = await recordAttempt({ puzzle: { ...puzzle, id: 'p2' }, score: 1, hintsUsed: 0, idemKey: 'k3', chessRating: 1800 });
    expect(other.attempt.rated).toBe(true);
    expect(other.attempt.before.rating).toBe(rating!.rating);
  });
});
