import { describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { ChessBackupDataSchema } from '../../schema';
import type { ChessBackupData } from '../../types';
import { exportChessData, importChessData } from '../backup';

const sample: ChessBackupData = {
  games: [
    {
      id: 'g1',
      idemKey: 'g1',
      uuid: 'g1',
      pgn: '1. e4 e5',
      timeClass: 'rapid',
      timeControl: '600',
      endTime: 1_700_000_000,
      rated: true,
      white: { username: 'Me', rating: 1100, result: 'win' },
      black: { username: 'Them', result: 'resigned' },
      syncedFor: 'me',
      ownerColour: 'w',
      ownerResult: 'win',
      pgnUnreadable: false,
    },
  ],
  syncState: [{ username: 'me', monthsComplete: ['2024/01'], lastSuccessAt: 5 }],
  ratings: [{ id: 'chesscom', rapid: 1100, fetchedAt: 9 }],
  puzzleAttempts: [],
  puzzleRating: [{ id: 'puzzle', rating: 1200, rd: 100, vol: 0.06 }],
  trees: [{ id: 't1', name: 'Italian', colour: 'w', createdAt: 1, nodes: [{ id: 'n1', parentId: null, uci: 'e2e4', san: 'e4', seq: 0 }], nextSeq: 1 }],
  srs: [{ posKey: 'p', E: 250, n: 1, I: 1, due: '2025-01-02' }],
  reviews: [{ id: 'r1', posKey: 'p', date: '2025-01-01', q: 4 }],
  tipState: [{ id: 'tips', dailyDate: '2025-01-01', dailyTipId: 'a', shown: { '800–999': ['a'] } }],
  evals: [{ gameId: 'g1', depth: 12, version: 1, ply: 0, eval: { kind: 'cp', cp: 20 }, bestUci: 'e2e4' }],
  reports: [{ gameId: 'g1', depth: 12, version: 1, createdAt: 3, counts: { blunder: 1 } }],
};

describe('chess backup data', () => {
  it('validates, imports and exports back unchanged, and a second import is stable', async () => {
    expect(ChessBackupDataSchema.safeParse(sample).success).toBe(true);
    await withFreshDb(async () => {
      await db.transaction('rw', db.tables, async () => importChessData(sample));
      const exported = await exportChessData();
      expect(exported).toEqual(sample);
      await db.transaction('rw', db.tables, async () => {
        for (const t of db.tables) if (t.name.startsWith('chess_')) await t.clear();
        await importChessData(exported);
      });
      expect(await exportChessData()).toEqual(exported);
    });
  });
});
