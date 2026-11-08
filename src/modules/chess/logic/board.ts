import { Chess, DEFAULT_POSITION } from 'chess.js';
import { BOARD_LIMITS } from '../constants';

export const START_FEN: string = DEFAULT_POSITION;

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string | undefined;
}

export interface PlayedMove extends MoveInput {
  san: string;
}

/** Free-board state: the start position, the played moves and the undone moves (R42.7). */
export interface BoardState {
  startFen: string;
  moves: PlayedMove[];
  redo: PlayedMove[];
}

export const INITIAL_BOARD: BoardState = { startFen: START_FEN, moves: [], redo: [] };

/** The position after all played moves. */
export function positionOf(state: BoardState, upTo: number = state.moves.length): Chess {
  const chess = new Chess(state.startFen);
  for (const m of state.moves.slice(0, upTo)) chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
  return chess;
}

export const currentFen = (state: BoardState): string => positionOf(state).fen();

/** Legal target squares of the piece on `from` in `fen`. */
export function legalTargets(fen: string, from: string): string[] {
  const chess = new Chess(fen);
  return [...new Set(chess.moves({ square: from as never, verbose: true }).map((m) => m.to))];
}

/** True when moving the piece on `from` to `to` is a legal pawn promotion. */
export function isPromotion(fen: string, from: string, to: string): boolean {
  const chess = new Chess(fen);
  return chess.moves({ square: from as never, verbose: true }).some((m) => m.to === to && m.promotion !== undefined);
}

/** Colour of the piece on `square`, or undefined. */
export function pieceColourAt(fen: string, square: string): 'w' | 'b' | undefined {
  return new Chess(fen).get(square as never)?.color;
}

/** Plays a legal move and empties the redo list; returns null for an illegal move, leaving the state unchanged (R42.2, R42.3). */
export function playMove(state: BoardState, input: MoveInput): BoardState | null {
  const chess = positionOf(state);
  try {
    const move = chess.move({ from: input.from, to: input.to, ...(input.promotion ? { promotion: input.promotion } : {}) });
    const played: PlayedMove = { from: move.from, to: move.to, san: move.san, ...(move.promotion ? { promotion: move.promotion } : {}) };
    return { ...state, moves: [...state.moves, played], redo: [] };
  } catch {
    return null;
  }
}

export function undoMove(state: BoardState): BoardState {
  const last = state.moves[state.moves.length - 1];
  if (last === undefined) return state;
  return { ...state, moves: state.moves.slice(0, -1), redo: [...state.redo, last] };
}

export function redoMove(state: BoardState): BoardState {
  const next = state.redo[state.redo.length - 1];
  if (next === undefined) return state;
  return { ...state, moves: [...state.moves, next], redo: state.redo.slice(0, -1) };
}

export type LoadResult = { ok: true; state: BoardState } | { ok: false; error: string };

const FEN_START = /^\s*[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+)+(\s|$)/;

const messageOf = (e: unknown): string => (e instanceof Error && e.message !== '' ? e.message : 'The text could not be read.');

/** Loads FEN or PGN text (R42.8, R42.9). Text that looks like a piece placement is a FEN, anything else a PGN. */
export function loadBoardText(text: string): LoadResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a FEN or PGN' };
  if (FEN_START.test(trimmed)) {
    if (trimmed.length > BOARD_LIMITS.FEN) return { ok: false, error: `A FEN can have at most ${BOARD_LIMITS.FEN} characters.` };
    try {
      return { ok: true, state: { startFen: new Chess(trimmed).fen(), moves: [], redo: [] } };
    } catch (e) {
      return { ok: false, error: messageOf(e) };
    }
  }
  if (text.length > BOARD_LIMITS.PGN) return { ok: false, error: `A PGN can have at most ${BOARD_LIMITS.PGN.toLocaleString('en-US')} characters.` };
  try {
    const chess = new Chess();
    chess.loadPgn(trimmed);
    const startFen = chess.header().FEN ?? START_FEN;
    const moves = chess.history({ verbose: true }).map<PlayedMove>((m) => ({
      from: m.from,
      to: m.to,
      san: m.san,
      ...(m.promotion ? { promotion: m.promotion } : {}),
    }));
    return { ok: true, state: { startFen, moves, redo: [] } };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}
