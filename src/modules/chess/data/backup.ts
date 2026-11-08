import Dexie from 'dexie';
import { stripUndefined } from '../../../core/db/strip';
import { ChessBackupDataSchema } from '../schema';
import type { ChessBackupData } from '../types';

export const CHESS_TABLES = {
  games: 'chess_games',
  syncState: 'chess_syncState',
  ratings: 'chess_ratings',
  puzzleAttempts: 'chess_puzzleAttempts',
  puzzleRating: 'chess_puzzleRating',
  trees: 'chess_trees',
  srs: 'chess_srs',
  reviews: 'chess_reviews',
  tipState: 'chess_tipState',
  evals: 'chess_evals',
  reports: 'chess_reports',
} as const;

/** Loaded on first use: core/db/db imports the module registry, which imports this module. */
const loadDb = async () => (await import('../../../core/db/db')).db;

const KEYS = Object.keys(CHESS_TABLES) as Array<keyof typeof CHESS_TABLES>;
const ALL_TABLES = Object.values(CHESS_TABLES);

/** Everything the Chess module stores. */
export async function exportChessData(): Promise<ChessBackupData> {
  const db = await loadDb();
  return db.transaction('r', ALL_TABLES, async () => {
    const out: Record<string, unknown[]> = {};
    for (const key of KEYS) out[key] = await db.table(CHESS_TABLES[key]).toArray();
    return out as unknown as ChessBackupData;
  });
}

/** Writes `data` into the (already cleared) Chess tables. */
export async function importChessData(data: ChessBackupData): Promise<void> {
  // Inside the importer's transaction nothing foreign may be awaited first, so take the database from it.
  const db = Dexie.currentTransaction?.db ?? (await loadDb());
  for (const key of KEYS) await db.table(CHESS_TABLES[key]).bulkAdd(stripUndefined(data[key]));
}

export const chessBackup = {
  dataVersion: 1,
  schema: ChessBackupDataSchema,
  migrations: {} as Record<number, (data: unknown) => unknown>,
  sections: (data: ChessBackupData) => KEYS.map((name) => ({ name, records: data[name] as unknown[] })),
};
