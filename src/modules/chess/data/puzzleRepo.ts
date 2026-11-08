import type Dexie from 'dexie';
import { db as appDb } from '../../../core/db/db';
import { createIdempotent } from '../../../core/db/idempotent';
import { newId } from '../../../core/ids';
import { write } from '../../../core/db/write';
import { initialPuzzleRating, updatePuzzleRating } from '../logic/glicko2';
import type { Puzzle, PuzzleAttempt, PuzzleRatingRecord } from '../types';
import { CHESS_TABLES } from './backup';

export interface PuzzleData {
  attempts: PuzzleAttempt[];
  rating: PuzzleRatingRecord | null;
}

export async function readPuzzleData(database: Dexie = appDb): Promise<PuzzleData> {
  const [attempts, rating] = await Promise.all([
    database.table<PuzzleAttempt, string>(CHESS_TABLES.puzzleAttempts).toArray(),
    database.table<PuzzleRatingRecord, string>(CHESS_TABLES.puzzleRating).get('puzzle'),
  ]);
  return { attempts, rating: rating ?? null };
}

export interface RecordedAttempt {
  attempt: PuzzleAttempt;
  /** False when the same Idempotency_Key had been stored already; nothing changed then. */
  created: boolean;
}

/**
 * Stores the decided score of a puzzle attempt (R48.9 to R48.11). One transaction reads the first attempt at
 * this puzzle, scores the attempt, adds it and, for a rated attempt, updates the Puzzle_Rating (initialised from
 * `chessRating` when none is stored). A repeated `idemKey` stores nothing new and updates nothing (R48.13).
 */
export async function recordAttempt(
  input: { puzzle: Pick<Puzzle, 'id' | 'rating' | 'rd'>; score: 0 | 1; hintsUsed: number; idemKey: string; chessRating: number; now?: number },
  database: Dexie = appDb,
): Promise<RecordedAttempt> {
  const attempts = database.table<PuzzleAttempt, string>(CHESS_TABLES.puzzleAttempts);
  const ratings = database.table<PuzzleRatingRecord, string>(CHESS_TABLES.puzzleRating);
  return write(
    [CHESS_TABLES.puzzleAttempts, CHESS_TABLES.puzzleRating],
    async () => {
      const known = await attempts.where('idemKey').equals(input.idemKey).first();
      if (known !== undefined) return { attempt: known, created: false };
      const stored = await ratings.get('puzzle');
      const rated = (await attempts.where('puzzleId').equals(input.puzzle.id).count()) === 0;
      const current = stored === undefined ? initialPuzzleRating(input.chessRating) : { rating: stored.rating, rd: stored.rd, vol: stored.vol };
      const after = rated ? updatePuzzleRating(current, input.puzzle, input.score) : current;
      const record: PuzzleAttempt = {
        id: newId(),
        idemKey: input.idemKey,
        puzzleId: input.puzzle.id,
        ts: input.now ?? Date.now(),
        score: input.score,
        hintsUsed: input.hintsUsed,
        rated,
        before: current,
        after,
      };
      const result = await createIdempotent(CHESS_TABLES.puzzleAttempts, record, database);
      if (result.created && rated) await ratings.put({ id: 'puzzle', ...after });
      return { attempt: result.record, created: result.created };
    },
    database,
  );
}
