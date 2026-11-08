import { describe, expect, it } from 'vitest';
import { isMonthCompleteAt, mapGame, mapStats, openingName, ownerResult, parseArchiveMonths, selectMonths } from '../sync';

const game = (over: Record<string, unknown> = {}) => ({
  uuid: 'u1',
  url: 'https://www.chess.com/game/live/1',
  rules: 'chess',
  end_time: 1_700_000_000,
  time_class: 'rapid',
  time_control: '600',
  rated: true,
  pgn: '[Event "x"]\n\n1. e4 e5 *',
  white: { username: 'AdiChessLarper', rating: 1100, result: 'win' },
  black: { username: 'Other', rating: 1200, result: 'resigned' },
  eco: 'https://www.chess.com/openings/Caro-Kann-Defense',
  ...over,
});

describe('ownerResult', () => {
  it.each([
    ['win', 'win'],
    ...['checkmated', 'resigned', 'timeout', 'abandoned', 'lose', 'bughousepartnerlose'].map((c) => [c, 'loss']),
    ...['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].map((c) => [c, 'draw']),
    ['somethingnew', 'unknown'],
  ])('%s -> %s', (code, expected) => expect(ownerResult(code as string)).toBe(expected));
});

describe('mapGame', () => {
  it('maps a normal game and finds the Owner colour ignoring case', () => {
    const m = mapGame(game(), 'adichesslarper');
    expect(m.kind).toBe('game');
    if (m.kind !== 'game') return;
    expect(m.record).toMatchObject({ id: 'u1', ownerColour: 'w', ownerResult: 'win', syncedFor: 'adichesslarper', pgnUnreadable: false });
    const b = mapGame(game({ white: { username: 'x', result: 'resigned' }, black: { username: 'ADICHESSLARPER', result: 'win' } }), 'AdiChessLarper');
    expect(b.kind === 'game' && b.record.ownerColour).toBe('b');
  });
  it('ignores other rules, skips games without key, time or Owner', () => {
    expect(mapGame(game({ rules: 'chess960' }), 'adichesslarper').kind).toBe('ignored');
    expect(mapGame(game({ uuid: '', url: '' }), 'adichesslarper').kind).toBe('skipped');
    expect(mapGame(game({ end_time: null }), 'adichesslarper').kind).toBe('skipped');
    expect(mapGame(game(), 'someoneelse').kind).toBe('skipped');
  });
  it('uses the url as key when uuid is empty and flags unreadable PGN', () => {
    const m = mapGame(game({ uuid: '', pgn: 'not a pgn at all 1. zz' }), 'adichesslarper');
    expect(m.kind === 'game' && m.record.id).toBe('https://www.chess.com/game/live/1');
    expect(m.kind === 'game' && m.record.pgnUnreadable).toBe(true);
  });
  it('takes the opening from the PGN ECOUrl header when eco is missing', () => {
    const pgn = '[ECOUrl "https://www.chess.com/openings/Sicilian-Defense"]\n\n1. e4 c5 *';
    const m = mapGame(game({ eco: undefined, pgn }), 'adichesslarper');
    expect(m.kind === 'game' && openingName(m.record.eco)).toBe('Sicilian Defense');
  });
  it('maps an unknown result code to unknown', () => {
    const m = mapGame(game({ white: { username: 'AdiChessLarper', result: 'weird' } }), 'adichesslarper');
    expect(m.kind === 'game' && m.record.ownerResult).toBe('unknown');
  });
});

describe('months and ratings', () => {
  it('parses, filters and sorts archive months', () => {
    expect(parseArchiveMonths(['https://x/2024/03', 'https://x/2023/12', 'https://x/2024/13', 'bad', 5])).toEqual(['2023/12', '2024/03']);
  });
  it('selects incomplete months plus the current and latest stored month', () => {
    const now = Date.UTC(2024, 2, 10);
    expect(selectMonths(['2024/01', '2024/02', '2024/03'], new Set(['2024/01', '2024/02', '2024/03']), now, '2024/02')).toEqual(['2024/02', '2024/03']);
  });
  it('marks a month complete only more than 24 h after it ended (UTC)', () => {
    const end = Date.UTC(2024, 2, 1);
    expect(isMonthCompleteAt('2024/02', end + 86_400_000)).toBe(false);
    expect(isMonthCompleteAt('2024/02', end + 86_400_001)).toBe(true);
  });
  it('opening names', () => {
    expect(openingName('https://www.chess.com/openings/Caro-Kann-Defense')).toBe('Caro Kann Defense');
    expect(openingName(undefined)).toBe('Unknown opening');
    expect(openingName('https://www.chess.com/openings/')).toBe('Unknown opening');
  });
  it('maps stats, rounding and dropping invalid values', () => {
    expect(
      mapStats({ chess_rapid: { last: { rating: 1100.6 } }, chess_blitz: { last: { rating: 5000 } }, tactics: { highest: { rating: 1500 }, lowest: { rating: null } } }),
    ).toEqual({ rapid: 1101, tacticsHigh: 1500 });
  });
});
