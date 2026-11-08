import type Dexie from 'dexie';
import { stripUndefined } from '../../../core/db/strip';
import { CORE_TABLES } from '../../../core/db/tables';
import { fold } from '../../../core/text/fold';
import { mapStats } from '../logic/sync';
import type { ChessComClient, ChessComError } from '../net/chesscom';
import { CHESS_SETTING_KEYS, usernameSchema } from '../settings';
import type { ChessComRatings } from '../types';
import { CHESS_TABLES } from './backup';
import { getChessComClient } from './client';

const loadDb = async () => (await import('../../../core/db/db')).db;

export interface RatingsDeps {
  client?: ChessComClient;
  database?: Dexie;
  /** Overrides the stored username. */
  username?: string;
}

async function storedUsername(deps: RatingsDeps): Promise<string> {
  if (deps.username !== undefined) return deps.username;
  const { readSetting } = await import('../../../core/settings/repo');
  return readSetting<string>(CHESS_SETTING_KEYS.username, deps.database);
}

/** The stored Chess.com ratings with their fetch time, or null before the first refresh. */
export async function readRatings(database?: Dexie): Promise<ChessComRatings | null> {
  const db = database ?? (await loadDb());
  return (await db.table<ChessComRatings, string>(CHESS_TABLES.ratings).get('chesscom')) ?? null;
}

export type RefreshRatingsResult = { ok: true; ratings: ChessComRatings } | { ok: false; error: ChessComError | { kind: 'write' } };

/**
 * One request to `/stats`; on 200 + JSON replaces all five values and the fetch time in one `put` (R43.1, R43.2).
 * Any failure keeps the stored ratings (R43.6 to R43.8).
 */
export async function refreshRatings(deps: RatingsDeps = {}): Promise<RefreshRatingsResult> {
  const client = deps.client ?? getChessComClient();
  const username = (await storedUsername(deps)).toLowerCase();
  const result = await client.get(`/pub/player/${encodeURIComponent(username)}/stats`);
  if (!result.ok) return result;
  const ratings: ChessComRatings = stripUndefined({ id: 'chesscom' as const, ...mapStats(result.data), fetchedAt: result.receivedAt });
  const db = deps.database ?? (await loadDb());
  try {
    const { write } = await import('../../../core/db/write');
    await write([CHESS_TABLES.ratings], () => db.table(CHESS_TABLES.ratings).put(ratings), db);
  } catch {
    return { ok: false, error: { kind: 'write' } };
  }
  return { ok: true, ratings };
}

export type VerifyResult =
  | { ok: true; username: string; changed: boolean }
  | { ok: false; error: ChessComError | { kind: 'format' } | { kind: 'write' } };

/**
 * Verifies a username with `/pub/player/{u}` and stores it as typed (R40.3, R40.4). A username that differs
 * only by letter case needs no request. When the folded name changes, the ratings singleton is deleted in the
 * same transaction; games are kept (R40.7). Any failure stores nothing.
 */
export async function verifyUsername(text: string, deps: RatingsDeps = {}): Promise<VerifyResult> {
  const parsed = usernameSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: { kind: 'format' } };
  const next = parsed.data;
  const previous = await storedUsername(deps);
  if (next === previous) return { ok: true, username: next, changed: false };
  const client = deps.client ?? getChessComClient();
  const result = await client.get(`/pub/player/${encodeURIComponent(next.toLowerCase())}`);
  if (!result.ok) return result;
  const db = deps.database ?? (await loadDb());
  try {
    const { write } = await import('../../../core/db/write');
    const { commitSetting } = await import('../../../core/settings/repo');
    await write(
      [CORE_TABLES.settings, CHESS_TABLES.ratings],
      async () => {
        await commitSetting(CHESS_SETTING_KEYS.username, next, db);
        if (fold(next) !== fold(previous)) await db.table(CHESS_TABLES.ratings).delete('chesscom');
      },
      db,
    );
  } catch {
    return { ok: false, error: { kind: 'write' } };
  }
  return { ok: true, username: next, changed: true };
}
