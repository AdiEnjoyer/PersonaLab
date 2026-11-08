import { describe, expect, it } from 'vitest';
import { clocksAt, formatClock, parseClocks, parseGame } from '../gameView';
import { analysisStatus, filterGames, NO_FILTERS, ratingHistory, sortGames } from '../games';
import { currentFen, INITIAL_BOARD, isPromotion, legalTargets, loadBoardText, playMove, redoMove, START_FEN, undoMove } from '../board';
import type { GameRecord } from '../../types';

import { PGN } from './fixtures';

const game = (over: Partial<GameRecord>): GameRecord => ({
  id: 'g1',
  idemKey: 'g1',
  pgn: PGN,
  timeClass: 'rapid',
  timeControl: '600',
  endTime: 1_700_000_000,
  rated: true,
  white: { username: 'adi', rating: 1200, result: 'win' },
  black: { username: 'bob', rating: 1180, result: 'resigned' },
  eco: 'https://www.chess.com/openings/Italian-Game',
  syncedFor: 'adi',
  ownerColour: 'w',
  ownerResult: 'win',
  pgnUnreadable: false,
  ...over,
});

describe('free board state', () => {
  it('accepts legal moves, rejects illegal ones and empties redo after a new move', () => {
    const a = playMove(INITIAL_BOARD, { from: 'e2', to: 'e4' });
    expect(a?.moves.map((m) => m.san)).toEqual(['e4']);
    expect(playMove(INITIAL_BOARD, { from: 'e2', to: 'e5' })).toBeNull();
    expect(playMove(INITIAL_BOARD, { from: 'e7', to: 'e5' })).toBeNull();
    const undone = undoMove(a!);
    expect(undone.redo).toHaveLength(1);
    expect(currentFen(redoMove(undone))).toBe(currentFen(a!));
    expect(playMove(undone, { from: 'd2', to: 'd4' })?.redo).toEqual([]);
  });

  it('knows legal targets and promotions', () => {
    expect(legalTargets(START_FEN, 'e2').sort()).toEqual(['e3', 'e4']);
    const fen = '8/P7/8/8/8/8/k6K/8 w - - 0 1';
    expect(isPromotion(fen, 'a7', 'a8')).toBe(true);
    expect(isPromotion(START_FEN, 'e2', 'e4')).toBe(false);
  });

  it('loads FEN and PGN, and reports errors without a state', () => {
    const fen = loadBoardText('8/P7/8/8/8/8/k6K/8 w - - 0 1');
    expect(fen.ok && fen.state.moves).toEqual([]);
    const pgn = loadBoardText(PGN);
    expect(pgn.ok && pgn.state.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(loadBoardText('   ')).toEqual({ ok: false, error: 'Enter a FEN or PGN' });
    const badFen = loadBoardText('8/8/8/8/8/8/8 w - - 0 1');
    expect(badFen.ok).toBe(false);
    expect(loadBoardText('1. e4 e4').ok).toBe(false);
    expect(loadBoardText(`8/8/8/8/8/8/8/8 ${'w'.repeat(100)}`)).toMatchObject({ ok: false, error: expect.stringContaining('100') });
  });
});

describe('game viewer logic', () => {
  it('parses clocks, truncates seconds and formats them', () => {
    expect(parseClocks(PGN)).toEqual([598, 597, 590, 580]);
    expect(formatClock(598)).toBe('9:58');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('shows the base time before a side has moved, then its latest clock', () => {
    const g = game({});
    expect(clocksAt(g, 0)).toEqual({ w: '10:00', b: '10:00' });
    expect(clocksAt(g, 1)).toEqual({ w: '9:58', b: '10:00' });
    expect(clocksAt(g, 3)).toEqual({ w: '9:50', b: '9:57' });
    expect(clocksAt(game({ timeClass: 'daily' }), 3)).toBeNull();
    expect(clocksAt(game({ pgn: '1. e4 e5' }), 1)).toBeNull();
  });

  it('parses a game and rejects an unreadable one', () => {
    expect(parseGame(PGN)?.moves).toHaveLength(4);
    expect(parseGame('1. e4 e4')).toBeNull();
  });
});

describe('game list logic', () => {
  const a = game({ id: 'a', idemKey: 'a', endTime: 100 });
  const b = game({ id: 'b', idemKey: 'b', endTime: 100, timeClass: 'blitz', ownerResult: 'loss' });
  const c = game({ id: 'c', idemKey: 'c', endTime: 200, ownerColour: 'b' });

  it('sorts newest first, ties by key', () => {
    expect(sortGames([a, b, c]).map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('filters by every selected filter', () => {
    expect(filterGames([a, b, c], { ...NO_FILTERS, timeClass: 'blitz' }).map((g) => g.id)).toEqual(['b']);
    expect(filterGames([a, b, c], { ...NO_FILTERS, colour: 'black' }).map((g) => g.id)).toEqual(['c']);
    expect(filterGames([a, b, c], { ...NO_FILTERS, result: 'loss', opening: 'Italian Game' }).map((g) => g.id)).toEqual(['b']);
  });

  it('derives the analysis status', () => {
    expect(analysisStatus(a, undefined)).toBe('Not analysed');
    expect(analysisStatus(a, 1)).toBe('Analysed');
    expect(analysisStatus(a, 0)).toBe('Outdated');
    expect(analysisStatus(game({ pgnUnreadable: true }), 1)).toBe('Cannot analyse');
  });

  it('builds the rating history from rated games of one class within the range', () => {
    const day = 86_400;
    const now = Math.floor(Date.UTC(2025, 5, 15, 12) / 1000);
    const games = [
      game({ id: '1', idemKey: '1', endTime: now - 200 * day }),
      game({ id: '2', idemKey: '2', endTime: now - 10 * day }),
      game({ id: '3', idemKey: '3', endTime: now - 5 * day, rated: false }),
      game({ id: '4', idemKey: '4', endTime: now - 2 * day, timeClass: 'blitz' }),
    ];
    const r = ratingHistory(games, 'rapid', '3m', '2025-06-15');
    expect(r.rated).toBe(2);
    expect(r.points.map((p) => p.rating)).toEqual([1200]);
    expect(ratingHistory(games, 'rapid', 'all', '2025-06-15').points).toHaveLength(2);
  });
});
