import type Dexie from 'dexie';
import { stripUndefined } from '../../../core/db/strip';
import { isMonthCompleteAt, mapGame, parseArchiveMonths, selectMonths, utcMonthOf } from '../logic/sync';
import type { ChessComClient, ChessComError } from '../net/chesscom';
import { CHESS_SETTING_KEYS } from '../settings';
import type { GameRecord, SyncState } from '../types';
import { CHESS_TABLES } from './backup';
import { getChessComClient } from './client';

const loadDb = async () => (await import('../../../core/db/db')).db;

export interface GameSyncDeps {
  client?: ChessComClient;
  database?: Dexie;
  /** Overrides the stored username. */
  username?: string;
  /** Checked between months; true stops the run (App moved to the background, R44.12). */
  shouldAbort?: () => boolean;
  /** Called before each month with the number processed so far and the total ("Syncing month N of M"). */
  onProgress?: (done: number, total: number) => void;
}

export type GameSyncResult =
  | { ok: true; created: number; skipped: number; months: number; empty: boolean }
  | {
      ok: false;
      error: ChessComError | { kind: 'write' } | { kind: 'aborted' } | { kind: 'busy' };
      /** Months processed and months selected when the run stopped. */
      done: number;
      total: number;
      created: number;
      skipped: number;
    };

let running = false;

/** Stored games of `username` and its sync state. */
async function readState(db: Dexie, username: string): Promise<{ state: SyncState; latestMonth?: string }> {
  const state = (await db.table<SyncState, string>(CHESS_TABLES.syncState).get(username)) ?? { username, monthsComplete: [] };
  let latest = -Infinity;
  await db
    .table<GameRecord, string>(CHESS_TABLES.games)
    .where('syncedFor')
    .equals(username)
    .each((g) => {
      if (g.endTime > latest) latest = g.endTime;
    });
  return Number.isFinite(latest) ? { state, latestMonth: utcMonthOf(latest * 1000) } : { state };
}

/** Maps and stores the games of one archive month in one transaction (R44.11). Returns the counts. */
export async function storeMonth(
  db: Dexie,
  username: string,
  month: string,
  rawGames: unknown,
  receivedAt: number,
): Promise<{ created: number; skipped: number }> {
  const { write } = await import('../../../core/db/write');
  const games = Array.isArray(rawGames) ? rawGames : [];
  const records: GameRecord[] = [];
  let skipped = 0;
  for (const raw of games) {
    const mapped = mapGame(raw, username);
    if (mapped.kind === 'skipped') skipped += 1;
    else if (mapped.kind === 'game') records.push(mapped.record);
  }
  return write([CHESS_TABLES.games, CHESS_TABLES.syncState], async () => {
    const table = db.table<GameRecord, string>(CHESS_TABLES.games);
    let created = 0;
    for (const record of records) {
      const exists = (await table.get(record.id)) !== undefined;
      if (!exists) created += 1;
      await table.put(stripUndefined(record));
    }
    if (isMonthCompleteAt(month, receivedAt)) {
      const syncTable = db.table<SyncState, string>(CHESS_TABLES.syncState);
      const state = (await syncTable.get(username)) ?? { username, monthsComplete: [] };
      if (!state.monthsComplete.includes(month)) {
        await syncTable.put({ ...state, monthsComplete: [...state.monthsComplete, month].sort() });
      }
    }
    return { created, skipped };
  }, db);
}

async function markSuccess(db: Dexie, username: string, at: number): Promise<void> {
  const { write } = await import('../../../core/db/write');
  await write([CHESS_TABLES.syncState], async () => {
    const table = db.table<SyncState, string>(CHESS_TABLES.syncState);
    const state = (await table.get(username)) ?? { username, monthsComplete: [] };
    await table.put({ ...state, lastSuccessAt: at });
  }, db);
}

/** Time of the last successful Game_Sync for the stored username, or null. */
export async function readLastSyncAt(database?: Dexie, username?: string): Promise<number | null> {
  const db = database ?? (await loadDb());
  const name = (username ?? (await (await import('../../../core/settings/repo')).readSetting<string>(CHESS_SETTING_KEYS.username, db))).toLowerCase();
  return (await db.table<SyncState, string>(CHESS_TABLES.syncState).get(name))?.lastSuccessAt ?? null;
}

/**
 * Incremental Game_Sync (R44.1 to R44.14): archives list, then each selected month in ascending order, one
 * request at a time and one transaction per month. Stops at the first failed request or write; months already
 * committed are kept and the last-success time is unchanged. Running again never duplicates games.
 */
export async function runGameSync(deps: GameSyncDeps = {}): Promise<GameSyncResult> {
  if (running) return { ok: false, error: { kind: 'busy' }, done: 0, total: 0, created: 0, skipped: 0 };
  running = true;
  try {
    const client = deps.client ?? getChessComClient();
    const db = deps.database ?? (await loadDb());
    const stored =
      deps.username ?? (await (await import('../../../core/settings/repo')).readSetting<string>(CHESS_SETTING_KEYS.username, db));
    const username = stored.toLowerCase();
    const fail = (error: Extract<GameSyncResult, { ok: false }>['error'], done: number, total: number, created: number, skipped: number): GameSyncResult => ({
      ok: false,
      error,
      done,
      total,
      created,
      skipped,
    });

    const archives = await client.get<{ archives?: unknown }>(`/pub/player/${encodeURIComponent(username)}/games/archives`);
    if (!archives.ok) return fail(archives.error, 0, 0, 0, 0);
    const listed = parseArchiveMonths((archives.data as { archives?: unknown } | null)?.archives);
    if (listed.length === 0) {
      try {
        await markSuccess(db, username, archives.receivedAt);
      } catch {
        return fail({ kind: 'write' }, 0, 0, 0, 0);
      }
      return { ok: true, created: 0, skipped: 0, months: 0, empty: true };
    }

    const { state, latestMonth } = await readState(db, username);
    const months = selectMonths(listed, new Set(state.monthsComplete), archives.receivedAt, latestMonth);
    let created = 0;
    let skipped = 0;
    for (let i = 0; i < months.length; i += 1) {
      if (deps.shouldAbort?.()) return fail({ kind: 'aborted' }, i, months.length, created, skipped);
      deps.onProgress?.(i, months.length);
      const month = months[i] as string;
      const response = await client.get<{ games?: unknown }>(`/pub/player/${encodeURIComponent(username)}/games/${month}`);
      if (!response.ok) return fail(response.error, i, months.length, created, skipped);
      try {
        const counts = await storeMonth(db, username, month, (response.data as { games?: unknown } | null)?.games, response.receivedAt);
        created += counts.created;
        skipped += counts.skipped;
      } catch {
        return fail({ kind: 'write' }, i, months.length, created, skipped);
      }
    }
    deps.onProgress?.(months.length, months.length);
    try {
      await markSuccess(db, username, Date.now());
    } catch {
      return fail({ kind: 'write' }, months.length, months.length, created, skipped);
    }
    return { ok: true, created, skipped, months: months.length, empty: false };
  } finally {
    running = false;
  }
}
