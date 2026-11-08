import { PuzzlesFileSchema } from '../schema';
import type { Puzzle } from '../types';

/** URL of the bundled `data/puzzles.json` under the app base. */
export const puzzlesUrl = (): string => `${import.meta.env.BASE_URL}data/puzzles.json`;

export type PuzzleLoad = { status: 'ready'; puzzles: Puzzle[] } | { status: 'empty' };

/** The file was fetched but is unreadable or not valid (R47.10). */
export class PuzzlesUnreadableError extends Error {
  override readonly name = 'PuzzlesUnreadableError';
}

let cached: Promise<PuzzleLoad> | null = null;

/**
 * Loads the bundled puzzles once per App run. A missing file (HTTP 404, or the app shell served in its place) or
 * an empty list is `empty`, which the screen explains; any other failure rejects and is not cached, so a retry
 * fetches again.
 */
export function loadPuzzles(fetchFn: typeof fetch = fetch): Promise<PuzzleLoad> {
  if (cached !== null) return cached;
  const attempt = (async (): Promise<PuzzleLoad> => {
    const response = await fetchFn(puzzlesUrl());
    if (response.status === 404) return { status: 'empty' };
    if (!response.ok) throw new PuzzlesUnreadableError(`HTTP ${response.status}`);
    if ((response.headers?.get('content-type') ?? '').includes('text/html')) return { status: 'empty' };
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new PuzzlesUnreadableError('The puzzle file is not valid JSON.');
    }
    const parsed = PuzzlesFileSchema.safeParse(json);
    if (!parsed.success) throw new PuzzlesUnreadableError('The puzzle file does not have the expected shape.');
    return parsed.data.length === 0 ? { status: 'empty' } : { status: 'ready', puzzles: parsed.data };
  })();
  cached = attempt;
  attempt.catch(() => {
    if (cached === attempt) cached = null;
  });
  return attempt;
}

/** For tests. */
export function resetPuzzlesCache(): void {
  cached = null;
}
