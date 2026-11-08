import { Chess } from 'chess.js';
import { round } from '../../../core/math/round';
import { PUZZLE } from '../constants';
import type { Colour, Puzzle, PuzzleAttempt } from '../types';

export interface Uci {
  from: string;
  to: string;
  promotion?: string | undefined;
}

export const parseUci = (uci: string): Uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}) });

/** The Owner's side: the side that is not to move in the puzzle FEN (R48.1). */
export const ownerColour = (puzzle: Puzzle): Colour => (puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w');

export type MoveVerdict = 'expected' | 'mate' | 'wrong' | 'illegal';

/**
 * Judges the Owner's move in `fen` against the `expected` solution move (R48.2, R48.3): the same origin, target and
 * promotion is accepted, so is any other legal move that checkmates; other legal moves are wrong; illegal moves
 * are neither (R42.3).
 */
export function judgeMove(fen: string, expected: string, move: Uci): MoveVerdict {
  const chess = new Chess(fen);
  let played;
  try {
    played = chess.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
  } catch {
    return 'illegal';
  }
  const want = parseUci(expected);
  if (played.from === want.from && played.to === want.to && (played.promotion ?? '') === (want.promotion ?? '')) return 'expected';
  return chess.isCheckmate() ? 'mate' : 'wrong';
}

/** The position after `uci`, or null when the move is illegal. */
export function applyUci(fen: string, uci: string): { fen: string; from: string; to: string } | null {
  const chess = new Chess(fen);
  const m = parseUci(uci);
  try {
    const played = chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    return { fen: chess.fen(), from: played.from, to: played.to };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Session reducer (R48)
// ---------------------------------------------------------------------------------------------

export type Phase = 'opponent' | 'owner' | 'wrong' | 'revealing' | 'solved' | 'ended';

export interface PuzzleState {
  puzzle: Puzzle;
  fen: string;
  /** Index in `puzzle.moves` of the next move to play. */
  ply: number;
  phase: Phase;
  lastMove?: { from: string; to: string } | undefined;
  /** The wrong move just tried; shown for `PUZZLE.REVERT_MS`. */
  wrong?: { from: string; to: string } | undefined;
  hintLevel: 0 | 1 | 2;
  hintsUsed: number;
  /** Decided once: 1 solved clean, 0 at the first fail, effective hint or shown solution (R48.9). */
  scoreDecided?: 0 | 1 | undefined;
  failed: boolean;
  solved: boolean;
}

export type PuzzleAction =
  | { type: 'opponent' }
  | { type: 'move'; move: Uci }
  | { type: 'hint' }
  | { type: 'show' }
  | { type: 'reveal' }
  | { type: 'clearWrong' }
  | { type: 'tryAgain' };

export const initialPuzzleState = (puzzle: Puzzle): PuzzleState => ({
  puzzle,
  fen: puzzle.fen,
  ply: 0,
  phase: 'opponent',
  hintLevel: 0,
  hintsUsed: 0,
  failed: false,
  solved: false,
});

const decide = (state: PuzzleState, score: 0 | 1): 0 | 1 => state.scoreDecided ?? score;

function step(state: PuzzleState): PuzzleState {
  const uci = state.puzzle.moves[state.ply];
  if (uci === undefined) return state;
  const applied = applyUci(state.fen, uci);
  if (applied === null) return state;
  return { ...state, fen: applied.fen, ply: state.ply + 1, lastMove: { from: applied.from, to: applied.to } };
}

/** Pure session logic of the trainer; timers (opponent delay, revert, solution steps) live in the screen. */
export function puzzleReducer(state: PuzzleState, action: PuzzleAction): PuzzleState {
  switch (action.type) {
    case 'opponent': {
      if (state.phase !== 'opponent') return state;
      const next = step(state);
      if (next.ply >= next.puzzle.moves.length) return { ...next, phase: 'solved', solved: true, scoreDecided: decide(next, 1) };
      return { ...next, phase: 'owner', hintLevel: 0 };
    }
    case 'move': {
      if (state.phase !== 'owner') return state;
      const expected = state.puzzle.moves[state.ply];
      if (expected === undefined) return state;
      const verdict = judgeMove(state.fen, expected, action.move);
      if (verdict === 'illegal') return state;
      if (verdict === 'wrong') {
        return { ...state, phase: 'wrong', failed: true, scoreDecided: decide(state, 0), wrong: { from: action.move.from, to: action.move.to } };
      }
      if (verdict === 'mate') {
        const uci = `${action.move.from}${action.move.to}${action.move.promotion ?? ''}`;
        const applied = applyUci(state.fen, uci);
        if (applied === null) return state;
        return { ...state, fen: applied.fen, lastMove: { from: applied.from, to: applied.to }, phase: 'solved', solved: true, hintLevel: 0, scoreDecided: decide(state, 1) };
      }
      const next = step(state);
      if (next.ply >= next.puzzle.moves.length) return { ...next, phase: 'solved', solved: true, hintLevel: 0, scoreDecided: decide(next, 1) };
      return { ...next, phase: 'opponent', hintLevel: 0 };
    }
    case 'hint': {
      if (state.phase !== 'owner' || state.hintLevel >= 2) return state;
      return { ...state, hintLevel: (state.hintLevel + 1) as 1 | 2, hintsUsed: state.hintsUsed + 1, scoreDecided: decide(state, 0) };
    }
    case 'show': {
      if (state.phase === 'solved' || state.phase === 'ended' || state.phase === 'revealing') return state;
      const base: PuzzleState = { ...state, scoreDecided: decide(state, 0), wrong: undefined, hintLevel: 0 };
      return { ...base, phase: state.ply >= state.puzzle.moves.length ? 'ended' : 'revealing' };
    }
    case 'reveal': {
      if (state.phase !== 'revealing') return state;
      const next = step(state);
      return next.ply >= next.puzzle.moves.length ? { ...next, phase: 'ended' } : next;
    }
    case 'clearWrong':
      return state.wrong === undefined ? state : { ...state, wrong: undefined };
    case 'tryAgain':
      return state.phase === 'wrong' ? { ...state, phase: 'owner', wrong: undefined, hintLevel: 0 } : state;
  }
}

/** Squares to mark for the current hint level (R48.7): the origin square, then the whole move. */
export function hintOf(state: PuzzleState): { from: string; to?: string } | undefined {
  if (state.phase !== 'owner' || state.hintLevel === 0) return undefined;
  const expected = state.puzzle.moves[state.ply];
  if (expected === undefined) return undefined;
  const m = parseUci(expected);
  return state.hintLevel === 1 ? { from: m.from } : { from: m.from, to: m.to };
}

// ---------------------------------------------------------------------------------------------
// Selection (R50.1 to R50.3)
// ---------------------------------------------------------------------------------------------

/** Puzzles tagged with at least one of `themes`; every puzzle when none is chosen (R50.2). */
export function filterByThemes(pool: readonly Puzzle[], themes: readonly string[]): Puzzle[] {
  if (themes.length === 0) return [...pool];
  const chosen = new Set(themes);
  return pool.filter((p) => p.themes.some((t) => chosen.has(t)));
}

/**
 * A random unattempted puzzle within the smallest window 100, 200, … around `target` that holds one; undefined
 * when every puzzle is attempted. Candidates are sorted by id so a fixed `rng` is reproducible.
 */
export function pickPuzzle(pool: readonly Puzzle[], attempted: ReadonlySet<string>, target: number, rng: () => number): Puzzle | undefined {
  const fresh = pool.filter((p) => !attempted.has(p.id));
  if (fresh.length === 0) return undefined;
  const nearest = Math.min(...fresh.map((p) => Math.abs(p.rating - target)));
  const width = PUZZLE.WINDOW_STEP * Math.max(1, Math.ceil(nearest / PUZZLE.WINDOW_STEP));
  const candidates = fresh.filter((p) => Math.abs(p.rating - target) <= width).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}

/** Pool puzzles whose rated attempt scored 0, in random order (R50.3). */
export function reviewQueue(pool: readonly Puzzle[], rated: ReadonlyMap<string, PuzzleAttempt>, rng: () => number): Puzzle[] {
  const queue = pool.filter((p) => rated.get(p.id)?.score === 0).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  return queue;
}

// ---------------------------------------------------------------------------------------------
// Statistics (R50.4 to R50.6)
// ---------------------------------------------------------------------------------------------

export interface ThemeStat {
  theme: string;
  rated: number;
  solved: number;
  /** Unrounded percent. */
  accuracy: number;
  /** Whole percent for display. */
  percent: number;
}

/** Rated attempts per theme, each counted toward every theme of its puzzle; theme name ascending. */
export function themeStats(attempts: readonly PuzzleAttempt[], puzzlesById: ReadonlyMap<string, Pick<Puzzle, 'themes'>>): ThemeStat[] {
  const counts = new Map<string, { rated: number; solved: number }>();
  for (const a of attempts) {
    if (!a.rated) continue;
    for (const theme of puzzlesById.get(a.puzzleId)?.themes ?? []) {
      const c = counts.get(theme) ?? { rated: 0, solved: 0 };
      c.rated += 1;
      c.solved += a.score;
      counts.set(theme, c);
    }
  }
  return [...counts.entries()]
    .map(([theme, c]) => ({ theme, ...c, accuracy: (100 * c.solved) / c.rated, percent: round((100 * c.solved) / c.rated) }))
    .sort((a, b) => (a.theme < b.theme ? -1 : a.theme > b.theme ? 1 : 0));
}

export const WEAK_MIN_RATED = 5;

/** Themes with at least 5 rated attempts, weakest first: accuracy ↑, attempts ↓, name ↑ (R50.6). */
export function weakestThemes(stats: readonly ThemeStat[]): ThemeStat[] {
  return stats
    .filter((s) => s.rated >= WEAK_MIN_RATED)
    .sort((a, b) => a.accuracy - b.accuracy || b.rated - a.rated || (a.theme < b.theme ? -1 : a.theme > b.theme ? 1 : 0));
}

/** The decision of a finished session: its stored fields, or undefined while the score is open. */
export const sessionScore = (s: PuzzleState): { score: 0 | 1; hintsUsed: number } | undefined =>
  s.scoreDecided === undefined ? undefined : { score: s.scoreDecided, hintsUsed: s.hintsUsed };
