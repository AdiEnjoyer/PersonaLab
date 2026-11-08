import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Colour, OwnerResult } from '../../../types';
import type { MoveLabel } from '../classify';
import {
  delayedCastling,
  earlyQueen,
  endgameTechnique,
  hangingPiece,
  missedOpponentFork,
  missedOpponentMate,
  missedOwnTactic,
  runDetectors,
  timePressure,
  type Detector,
  type DetectorInput,
  type EvalInfo,
} from '../detectors';
import { buildPositions } from '../positions';

interface Single {
  fen: string;
  uci: string;
  label?: MoveLabel;
  evals?: Array<EvalInfo | undefined>;
  clock?: number;
  timeClass?: string;
  timeControl?: string;
  owner?: Colour;
  result?: OwnerResult;
}

/** A one-move game starting from `fen`. */
function single(s: Single): DetectorInput {
  const chess = new Chess(s.fen);
  const m = chess.move({ from: s.uci.slice(0, 2), to: s.uci.slice(2, 4), ...(s.uci[4] ? { promotion: s.uci[4] } : {}) });
  const owner = s.owner ?? m.color;
  return {
    positions: [
      { fen: s.fen },
      { fen: chess.fen(), move: { uci: s.uci, san: m.san, from: m.from, to: m.to, piece: m.piece, ...(m.captured ? { captured: m.captured } : {}), colour: m.color } },
    ],
    evals: s.evals ?? [undefined, undefined],
    labels: [null, s.label ?? null],
    clocks: [undefined, s.clock],
    timeControl: s.timeControl ?? '600',
    timeClass: s.timeClass ?? 'rapid',
    ownerColour: owner,
    ownerResult: s.result ?? 'unknown',
  };
}

/** A game from SAN moves. */
function game(sans: string[], over: Partial<DetectorInput> = {}): DetectorInput {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  const positions = buildPositions(chess.pgn());
  if (!positions) throw new Error('unreadable');
  return {
    positions,
    evals: positions.map(() => undefined),
    labels: positions.map(() => null),
    clocks: positions.map(() => undefined),
    timeControl: '600',
    timeClass: 'rapid',
    ownerColour: 'w',
    ownerResult: 'unknown',
    ...over,
  };
}

const flip = (i: DetectorInput): DetectorInput => ({ ...i, ownerColour: i.ownerColour === 'w' ? 'b' : 'w' });
const cp = (n: number, bestUci?: string): EvalInfo => ({ kind: 'cp', cp: n, ...(bestUci ? { bestUci } : {}) });

function expectSilentForOpponent(d: Detector, i: DetectorInput): void {
  expect(d(flip(i), 1)).toBeNull();
}

describe('hangingPiece', () => {
  const fen = '4k3/8/8/8/2b5/8/8/R3K3 w - - 0 1';
  it('fires when the reply wins an undefended rook', () => {
    const i = single({ fen, uci: 'a1a6', label: 'blunder', evals: [cp(0), cp(500, 'c4a6')] });
    const d = hangingPiece(i, 1);
    expect(d).toMatchObject({ detector: 'hanging-piece', ply: 1, fullMove: 1, phase: 'endgame' });
    expect(d?.explanation).toContain('Bxa6');
    expect(d?.explanation).toContain('rook on a6');
    expectSilentForOpponent(hangingPiece, i);
  });
  it('is silent when the reply is not a capture or the move is only an inaccuracy', () => {
    expect(hangingPiece(single({ fen, uci: 'a1a3', label: 'blunder', evals: [cp(0), cp(0, 'c4b5')] }), 1)).toBeNull();
    expect(hangingPiece(single({ fen, uci: 'a1a6', label: 'inaccuracy', evals: [cp(0), cp(500, 'c4a6')] }), 1)).toBeNull();
    expect(hangingPiece(single({ fen, uci: 'a1a6', label: 'blunder' }), 1)).toBeNull();
  });
});

describe('missedOpponentFork', () => {
  const fen = '4k3/8/8/8/1n6/8/7P/R3K3 w - - 0 1';
  it('fires when the best reply is a knight fork of king and rook', () => {
    const i = single({ fen, uci: 'h2h3', label: 'mistake', evals: [cp(0), cp(-600, 'b4c2')] });
    const d = missedOpponentFork(i, 1);
    expect(d).toMatchObject({ detector: 'missed-opponent-fork', ply: 1 });
    expect(d?.explanation).toContain('Nc2+');
    expectSilentForOpponent(missedOpponentFork, i);
  });
  it('is silent when the reply attacks only one target', () => {
    expect(missedOpponentFork(single({ fen, uci: 'h2h3', label: 'mistake', evals: [cp(0), cp(-100, 'b4d3')] }), 1)).toBeNull();
    expect(missedOpponentFork(single({ fen, uci: 'h2h3', label: null, evals: [cp(0), cp(-600, 'b4c2')] }), 1)).toBeNull();
  });
});

describe('missedOpponentMate', () => {
  const fen = 'r5k1/5ppp/8/1N6/8/8/5PPP/6K1 w - - 0 1';
  it('fires when the position after the move is a forced mate for the opponent', () => {
    const i = single({ fen, uci: 'b5d6', evals: [cp(0), { kind: 'mate', n: 1, bestUci: 'a8a1' }] });
    const d = missedOpponentMate(i, 1);
    expect(d).toMatchObject({ detector: 'missed-opponent-mate', ply: 1 });
    expect(d?.explanation).toContain('mate in 1');
    expectSilentForOpponent(missedOpponentMate, i);
  });
  it('is silent when the Owner was already getting mated, or the reply is no mate', () => {
    expect(missedOpponentMate(single({ fen, uci: 'b5d6', evals: [{ kind: 'mate', n: -1 }, { kind: 'mate', n: 1 }] }), 1)).toBeNull();
    expect(missedOpponentMate(single({ fen, uci: 'b5d6', evals: [cp(0), cp(300)] }), 1)).toBeNull();
    expect(missedOpponentMate(single({ fen, uci: 'b5d6', evals: [cp(0), { kind: 'mate', n: -2 }] }), 1)).toBeNull();
  });
});

describe('missedOwnTactic', () => {
  const fen = '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1';
  it('fires when a winning capture was skipped for 200+ cp', () => {
    const i = single({ fen, uci: 'e1f1', label: 'blunder', evals: [cp(900, 'd1d5'), cp(0)] });
    const d = missedOwnTactic(i, 1);
    expect(d).toMatchObject({ detector: 'missed-own-tactic', ply: 1 });
    expect(d?.explanation).toContain('capture Qxd5 ');
    expectSilentForOpponent(missedOwnTactic, i);
  });
  it('fires when a forced mate was missed', () => {
    const i = single({ fen, uci: 'e1f1', label: 'blunder', evals: [{ kind: 'mate', n: 2, bestUci: 'd1d5' }, cp(0)] });
    expect(missedOwnTactic(i, 1)?.explanation).toContain('forced mate in 2');
  });
  it('is silent when the best move is quiet, the gain is under 200 cp, or the move is not a mistake', () => {
    expect(missedOwnTactic(single({ fen, uci: 'e1f1', label: 'blunder', evals: [cp(900, 'd1d2'), cp(0)] }), 1)).toBeNull();
    expect(missedOwnTactic(single({ fen, uci: 'e1f1', label: 'blunder', evals: [cp(150, 'd1d5'), cp(0)] }), 1)).toBeNull();
    expect(missedOwnTactic(single({ fen, uci: 'e1f1', label: 'inaccuracy', evals: [cp(900, 'd1d5'), cp(0)] }), 1)).toBeNull();
  });
});

describe('delayedCastling', () => {
  const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  const never = Array.from({ length: 6 }, () => shuffle).flat();
  it('fires on the 12th Owner move when the king never left e1', () => {
    const i = game(never);
    expect(delayedCastling(i, 23)).toMatchObject({ detector: 'delayed-castling', ply: 23, fullMove: 12 });
    expect(runDetectors(i).filter((d) => d.detector === 'delayed-castling')).toHaveLength(1);
    expect(delayedCastling(flip(i), 23)).toBeNull();
    expect(runDetectors(flip(i)).every((d) => d.ply % 2 === 0)).toBe(true);
  });
  it('is silent when the Owner castled, or the game is shorter than 12 Owner moves', () => {
    const castled = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'Re1', 'O-O', ...['Rf1', 'Re8', 'Re1', 'Rf8', 'Rf1', 'Re8', 'Re1', 'Rf8', 'Rf1', 'Re8', 'Re1', 'Rf8', 'Rf1', 'Re8']];
    expect(runDetectors(game(castled)).some((d) => d.detector === 'delayed-castling')).toBe(false);
    expect(runDetectors(game(never.slice(0, 20))).some((d) => d.detector === 'delayed-castling')).toBe(false);
  });
});

describe('earlyQueen', () => {
  it('fires once on the first non-capturing queen move in the first 5 moves', () => {
    const i = game(['e4', 'e5', 'Qh5', 'Nc6', 'Qf3', 'Nf6']);
    expect(earlyQueen(i, 3)).toMatchObject({ detector: 'early-queen', ply: 3, fullMove: 2 });
    expect(earlyQueen(i, 5)).toBeNull();
    expect(earlyQueen(flip(i), 3)).toBeNull();
  });
  it('is silent for a queen capture, a queen move after move 5, or no queen move', () => {
    expect(runDetectors(game(['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'], { ownerColour: 'b' })).some((d) => d.detector === 'early-queen')).toBe(true);
    expect(runDetectors(game(['e4', 'd5', 'exd5', 'Qxd5'], { ownerColour: 'b' })).some((d) => d.detector === 'early-queen')).toBe(false);
    const late = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'd6', 'Nc3', 'Nf6', 'Bg5', 'h6', 'Qd2', 'a6'];
    expect(runDetectors(game(late)).some((d) => d.detector === 'early-queen')).toBe(false);
  });
});

describe('endgameTechnique', () => {
  const fen = '4k3/8/8/8/8/8/R7/4K3 w - - 0 1';
  it('fires on a mistake made in an endgame', () => {
    const i = single({ fen, uci: 'a2a8', label: 'mistake' });
    expect(endgameTechnique(i, 1)).toMatchObject({ detector: 'endgame-technique', ply: 1, phase: 'endgame' });
    expectSilentForOpponent(endgameTechnique, i);
  });
  it('fires once on the first endgame move when a winning position ended in a draw or loss', () => {
    const i = single({ fen, uci: 'a2a3', evals: [cp(500), undefined], result: 'draw' });
    expect(endgameTechnique(i, 1)?.explanation).toContain('draw');
  });
  it('is silent without a mistake or when the winning position was converted', () => {
    expect(endgameTechnique(single({ fen, uci: 'a2a3', evals: [cp(500), undefined], result: 'win' }), 1)).toBeNull();
    expect(endgameTechnique(single({ fen, uci: 'a2a3', evals: [cp(100), undefined], result: 'loss' }), 1)).toBeNull();
    const middle = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 13';
    expect(endgameTechnique(single({ fen: middle, uci: 'e2e4', label: 'blunder', evals: [cp(500), undefined], result: 'loss' }), 1)).toBeNull();
  });
});

describe('timePressure', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  it('fires on a blunder with under 10 % of the base time left', () => {
    const i = single({ fen, uci: 'e2e4', label: 'blunder', clock: 20 });
    expect(timePressure(i, 1)).toMatchObject({ detector: 'time-pressure', ply: 1 });
    expectSilentForOpponent(timePressure, i);
  });
  it('is silent with plenty of time, a daily game, a missing clock, or only an inaccuracy', () => {
    expect(timePressure(single({ fen, uci: 'e2e4', label: 'blunder', clock: 60 }), 1)).toBeNull();
    expect(timePressure(single({ fen, uci: 'e2e4', label: 'blunder', clock: 20, timeClass: 'daily', timeControl: '1/86400' }), 1)).toBeNull();
    expect(timePressure(single({ fen, uci: 'e2e4', label: 'blunder' }), 1)).toBeNull();
    expect(timePressure(single({ fen, uci: 'e2e4', label: 'inaccuracy', clock: 20 }), 1)).toBeNull();
  });
});

describe('runDetectors', () => {
  it('is deterministic and reports only Owner plies', () => {
    const i = game(['e4', 'e5', 'Qh5', 'Nc6'], { labels: [null, null, null, 'blunder', null], clocks: [undefined, 500, 500, 10, 500] });
    expect(runDetectors(i)).toEqual(runDetectors(i));
    expect(runDetectors(i).every((d) => d.ply % 2 === 1)).toBe(true);
  });
});
