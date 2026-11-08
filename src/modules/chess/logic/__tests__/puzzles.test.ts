import { describe, expect, it } from 'vitest';
import type { Puzzle, PuzzleAttempt } from '../../types';
import {
  filterByThemes,
  hintOf,
  initialPuzzleState,
  judgeMove,
  ownerColour,
  pickPuzzle,
  puzzleReducer,
  reviewQueue,
  themeStats,
  weakestThemes,
  type PuzzleAction,
  type PuzzleState,
} from '../puzzles';
import { LINE_PUZZLE, MATE_PUZZLE, SCHOLAR_PUZZLE } from './puzzleFixtures';

const run = (puzzle: Puzzle, actions: PuzzleAction[]): PuzzleState => actions.reduce(puzzleReducer, initialPuzzleState(puzzle));

describe('judgeMove', () => {
  it('accepts the expected move, an alternative mate, and rejects other legal moves', () => {
    const fen = '7k/5ppp/8/8/8/8/5PPP/RR4K1 w - - 1 2';
    expect(judgeMove(fen, 'a1a8', { from: 'a1', to: 'a8' })).toBe('expected');
    expect(judgeMove(fen, 'a1a8', { from: 'b1', to: 'b8' })).toBe('mate');
    expect(judgeMove(fen, 'a1a8', { from: 'a1', to: 'a7' })).toBe('wrong');
    expect(judgeMove(fen, 'a1a8', { from: 'a1', to: 'h8' })).toBe('illegal');
  });

  it('compares the promotion piece', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    expect(judgeMove(fen, 'a7a8q', { from: 'a7', to: 'a8', promotion: 'q' })).toBe('expected');
    expect(judgeMove(fen, 'a7a8q', { from: 'a7', to: 'a8', promotion: 'n' })).toBe('wrong');
  });
});

describe('puzzleReducer', () => {
  it('starts with the opponent move and orients to the Owner’s side', () => {
    expect(ownerColour(MATE_PUZZLE)).toBe('w');
    expect(ownerColour(LINE_PUZZLE)).toBe('b');
    const s = run(MATE_PUZZLE, [{ type: 'move', move: { from: 'a1', to: 'a8' } }]);
    expect(s.phase).toBe('opponent');
    expect(s.ply).toBe(0);
    const t = run(MATE_PUZZLE, [{ type: 'opponent' }]);
    expect(t.phase).toBe('owner');
    expect(t.ply).toBe(1);
  });

  it('scores 1 when solved cleanly, including through the alternative mate', () => {
    const solved = run(MATE_PUZZLE, [{ type: 'opponent' }, { type: 'move', move: { from: 'a1', to: 'a8' } }]);
    expect(solved).toMatchObject({ phase: 'solved', solved: true, scoreDecided: 1, failed: false });
    const alt = run(MATE_PUZZLE, [{ type: 'opponent' }, { type: 'move', move: { from: 'b1', to: 'b8' } }]);
    expect(alt).toMatchObject({ phase: 'solved', solved: true, scoreDecided: 1 });
  });

  it('plays the opponent reply in a longer line', () => {
    const s = run(LINE_PUZZLE, [{ type: 'opponent' }, { type: 'move', move: { from: 'e7', to: 'e5' } }]);
    expect(s.phase).toBe('opponent');
    expect(s.ply).toBe(2);
    const t = puzzleReducer(s, { type: 'opponent' });
    expect(t.phase).toBe('owner');
    const done = puzzleReducer(t, { type: 'move', move: { from: 'b8', to: 'c6' } });
    expect(done).toMatchObject({ phase: 'solved', scoreDecided: 1 });
  });

  it('fails on a wrong move at once, keeps the position and decides 0 only once', () => {
    const wrong = run(MATE_PUZZLE, [{ type: 'opponent' }, { type: 'move', move: { from: 'a1', to: 'a7' } }]);
    expect(wrong).toMatchObject({ phase: 'wrong', failed: true, scoreDecided: 0, wrong: { from: 'a1', to: 'a7' } });
    expect(wrong.fen).toBe(run(MATE_PUZZLE, [{ type: 'opponent' }]).fen);
    const retried = [{ type: 'clearWrong' }, { type: 'tryAgain' }, { type: 'move', move: { from: 'a1', to: 'a8' } }] as PuzzleAction[];
    const end = retried.reduce(puzzleReducer, wrong);
    expect(end).toMatchObject({ phase: 'solved', solved: true, scoreDecided: 0 });
  });

  it('ignores illegal moves without failing', () => {
    const s = run(MATE_PUZZLE, [{ type: 'opponent' }, { type: 'move', move: { from: 'a1', to: 'h8' } }]);
    expect(s).toMatchObject({ phase: 'owner', failed: false });
    expect(s.scoreDecided).toBeUndefined();
  });

  it('counts hints: level 1 square, level 2 arrow, then nothing; a hint decides 0', () => {
    const start = run(MATE_PUZZLE, [{ type: 'opponent' }]);
    const one = puzzleReducer(start, { type: 'hint' });
    expect(hintOf(one)).toEqual({ from: 'a1' });
    expect(one).toMatchObject({ hintsUsed: 1, scoreDecided: 0 });
    const two = puzzleReducer(one, { type: 'hint' });
    expect(hintOf(two)).toEqual({ from: 'a1', to: 'a8' });
    const three = puzzleReducer(two, { type: 'hint' });
    expect(three.hintsUsed).toBe(2);
    expect(three).toBe(two);
    const solved = puzzleReducer(three, { type: 'move', move: { from: 'a1', to: 'a8' } });
    expect(solved).toMatchObject({ solved: true, scoreDecided: 0, hintsUsed: 2 });
  });

  it('resets the hint level for the next Owner move', () => {
    const s = run(LINE_PUZZLE, [{ type: 'opponent' }, { type: 'hint' }, { type: 'move', move: { from: 'e7', to: 'e5' } }, { type: 'opponent' }]);
    expect(s.hintLevel).toBe(0);
    expect(hintOf(s)).toBeUndefined();
  });

  it('show solution decides 0 and plays the remaining moves of both sides', () => {
    let s = run(LINE_PUZZLE, [{ type: 'opponent' }, { type: 'show' }]);
    expect(s).toMatchObject({ phase: 'revealing', scoreDecided: 0 });
    s = puzzleReducer(s, { type: 'reveal' });
    expect(s.phase).toBe('revealing');
    s = puzzleReducer(s, { type: 'reveal' });
    s = puzzleReducer(s, { type: 'reveal' });
    expect(s).toMatchObject({ phase: 'ended', solved: false, ply: 4 });
  });

  it('solves a mate-in-one scholar line', () => {
    const s = run(SCHOLAR_PUZZLE, [{ type: 'opponent' }, { type: 'move', move: { from: 'h5', to: 'f7' } }]);
    expect(s).toMatchObject({ phase: 'solved', scoreDecided: 1 });
  });
});

const p = (id: string, rating: number, themes: string[] = []): Puzzle => ({ ...MATE_PUZZLE, id, rating, themes });

describe('selection', () => {
  const pool = [p('a', 700), p('b', 790), p('c', 1000), p('d', 1010), p('e', 1500)];

  it('widens the window in steps of 100 and skips attempted puzzles', () => {
    expect(pickPuzzle(pool, new Set(), 750, () => 0)?.id).toBe('a');
    expect(pickPuzzle(pool, new Set(), 750, () => 0.99)?.id).toBe('b');
    expect(pickPuzzle(pool, new Set(['a', 'b']), 750, () => 0)?.id).toBe('c');
    expect(pickPuzzle(pool, new Set(['a', 'b', 'c', 'd']), 750, () => 0)?.id).toBe('e');
    expect(pickPuzzle(pool, new Set(pool.map((x) => x.id)), 750, () => 0)).toBeUndefined();
  });

  it('uses a window of at least 100 around the target and includes its edge', () => {
    expect(pickPuzzle([p('x', 850), p('y', 851)], new Set(), 750, () => 0.99)?.id).toBe('x');
  });

  it('filters by themes', () => {
    const themed = [p('a', 1, ['fork']), p('b', 1, ['pin', 'fork']), p('c', 1, ['mate'])];
    expect(filterByThemes(themed, []).length).toBe(3);
    expect(filterByThemes(themed, ['fork']).map((x) => x.id)).toEqual(['a', 'b']);
    expect(filterByThemes(themed, ['pin', 'mate']).map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('queues the rated failures for review', () => {
    const att = (puzzleId: string, score: 0 | 1): PuzzleAttempt => ({
      id: puzzleId,
      idemKey: puzzleId,
      puzzleId,
      ts: 1,
      score,
      hintsUsed: 0,
      rated: true,
      before: { rating: 1, rd: 1, vol: 1 },
      after: { rating: 1, rd: 1, vol: 1 },
    });
    const rated = new Map([att('a', 0), att('b', 1), att('c', 0)].map((a) => [a.puzzleId, a]));
    expect(reviewQueue(pool, rated, () => 0).map((x) => x.id).sort()).toEqual(['a', 'c']);
  });
});

describe('theme statistics', () => {
  const puzzles = new Map([
    ['a', { themes: ['fork', 'short'] }],
    ['b', { themes: ['pin'] }],
  ]);
  const att = (puzzleId: string, score: 0 | 1, rated = true): PuzzleAttempt => ({
    id: `${puzzleId}${score}${rated}${Math.random()}`,
    idemKey: `${puzzleId}${Math.random()}`,
    puzzleId,
    ts: 1,
    score,
    hintsUsed: 0,
    rated,
    before: { rating: 1, rd: 1, vol: 1 },
    after: { rating: 1, rd: 1, vol: 1 },
  });

  it('counts each rated attempt for every theme, ignores unrated ones', () => {
    const stats = themeStats([att('a', 1), att('a', 0), att('a', 1, false), att('b', 1)], puzzles);
    expect(stats).toEqual([
      { theme: 'fork', rated: 2, solved: 1, accuracy: 50, percent: 50 },
      { theme: 'pin', rated: 1, solved: 1, accuracy: 100, percent: 100 },
      { theme: 'short', rated: 2, solved: 1, accuracy: 50, percent: 50 },
    ]);
  });

  it('lists the weakest themes with at least 5 rated attempts', () => {
    const attempts = [
      ...[1, 1, 1, 0, 0].map((s) => att('a', s as 0 | 1)),
      ...[1, 1, 1, 1, 0, 0].map((s) => att('b', s as 0 | 1)),
    ];
    const weakest = weakestThemes(themeStats(attempts, puzzles));
    expect(weakest.map((s) => s.theme)).toEqual(['fork', 'short', 'pin']);
    expect(weakestThemes(themeStats([att('a', 0)], puzzles))).toEqual([]);
  });
});
