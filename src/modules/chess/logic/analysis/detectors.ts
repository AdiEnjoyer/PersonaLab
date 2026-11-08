import { Chess, type Move } from 'chess.js';
import { DETECTOR, DETECTOR_IDS, MATE_CP, PIECE_VALUE, TACTIC_MIN_GAIN_CP } from '../../constants';
import type { Colour, DetectorId, OwnerResult, StoredEval } from '../../types';
import { baseSeconds } from '../gameView';
import type { MoveLabel } from './classify';
import { gamePhase, type GamePhase } from './phase';
import type { PositionInfo } from './positions';
import { winProbOf } from './winProb';

export type EvalInfo = StoredEval & { bestUci?: string | undefined; pv?: string[] | undefined };

export interface DetectorInput {
  /** Position 0 is the start; position p is the position after ply p. */
  positions: PositionInfo[];
  /** Index = position index. */
  evals: Array<EvalInfo | undefined>;
  /** Index = ply (1-based); entry 0 is unused. */
  labels: MoveLabel[];
  /** Seconds left after each ply; index = ply (1-based). */
  clocks: Array<number | undefined>;
  timeControl: string;
  timeClass: string;
  ownerColour: Colour;
  ownerResult: OwnerResult;
}

export interface Detection {
  detector: DetectorId;
  ply: number;
  fullMove: number;
  phase: GamePhase;
  explanation: string;
}

/** One detector: a pure function of the input and the ply, silent (null) on anything but an Owner move it recognises. */
export type Detector = (i: DetectorInput, ply: number) => Detection | null;

const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const valueOf = (type: string): number => PIECE_VALUE[type as keyof typeof PIECE_VALUE] ?? 0;
const colourName = (c: Colour): string => (c === 'w' ? 'White' : 'Black');
const other = (c: Colour): Colour => (c === 'w' ? 'b' : 'w');

export const isOwnerPly = (i: DetectorInput, ply: number): boolean => i.positions[ply]?.move?.colour === i.ownerColour;
const isBad = (i: DetectorInput, ply: number): boolean => i.labels[ply] === 'mistake' || i.labels[ply] === 'blunder';

function make(i: DetectorInput, detector: DetectorId, ply: number, explanation: string): Detection {
  const before = i.positions[ply - 1]?.fen ?? '';
  return { detector, ply, fullMove: Math.ceil(ply / 2), phase: gamePhase(before), explanation };
}

/** Plays a UCI move on a FEN; null when it is not legal there. */
function play(fen: string, uci: string | undefined): { chess: Chess; move: Move } | null {
  if (uci === undefined || uci.length < 4) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
    return { chess, move };
  } catch {
    return null;
  }
}

interface Target {
  square: string;
  type: string;
}

/**
 * Targets of the piece on `attackerSquare`: the victim side's king, and its pieces of value 3+ that are
 * undefended or worth more than the attacker (R57.3, R57.4).
 */
function targetsOf(chess: Chess, attackerSquare: string, attackerColour: Colour): Target[] {
  const attacker = chess.get(attackerSquare as never);
  if (!attacker) return [];
  const victim = other(attackerColour);
  const out: Target[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== victim) continue;
      if (!chess.attackers(cell.square, attackerColour).includes(attackerSquare as never)) continue;
      if (cell.type === 'k') {
        out.push({ square: cell.square, type: 'k' });
      } else if (valueOf(cell.type) >= DETECTOR.MIN_TARGET_VALUE) {
        const defended = chess.attackers(cell.square, victim).length > 0;
        if (!defended || valueOf(cell.type) > valueOf(attacker.type)) out.push({ square: cell.square, type: cell.type });
      }
    }
  }
  return out;
}

const isFork = (chess: Chess, square: string, colour: Colour): boolean => targetsOf(chess, square, colour).length >= DETECTOR.MIN_FORK_TARGETS;

const cpFor = (e: StoredEval): number => {
  switch (e.kind) {
    case 'cp':
      return e.cp;
    case 'mate':
      return e.n > 0 ? MATE_CP : -MATE_CP;
    case 'mated':
      return -MATE_CP;
    case 'draw':
      return 0;
  }
};

const sanOf = (i: DetectorInput, ply: number): string => i.positions[ply]?.move?.san ?? '';

/** R57.3: the engine's reply captures an Owner piece of value 3+ that is undefended or worth more than the capturer. */
export const hangingPiece: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply) || !isBad(i, ply)) return null;
  const after = i.positions[ply]?.fen;
  const reply = i.evals[ply]?.bestUci;
  if (after === undefined || reply === undefined) return null;
  const played = play(after, reply);
  if (!played || played.move.captured === undefined) return null;
  const type = played.move.captured;
  if (valueOf(type) < DETECTOR.MIN_TARGET_VALUE) return null;
  const before = new Chess(after);
  const defended = before.attackers(played.move.to, i.ownerColour).length > 0;
  const capturerValue = valueOf(played.move.piece);
  if (defended && valueOf(type) <= capturerValue) return null;
  return make(i, 'hanging-piece', ply, `After ${sanOf(i, ply)}, ${colourName(other(i.ownerColour))}'s best reply ${played.move.san} wins your ${PIECE_NAME[type]} on ${played.move.to}.`);
};

/** R57.4: the engine's reply forks two or more Owner targets. */
export const missedOpponentFork: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply) || !isBad(i, ply)) return null;
  const after = i.positions[ply]?.fen;
  const played = after === undefined ? null : play(after, i.evals[ply]?.bestUci);
  if (!played) return null;
  const targets = targetsOf(played.chess, played.move.to, other(i.ownerColour));
  if (targets.length < DETECTOR.MIN_FORK_TARGETS) return null;
  const names = targets.map((t) => `${PIECE_NAME[t.type]} on ${t.square}`).join(' and ');
  return make(i, 'missed-opponent-fork', ply, `After ${sanOf(i, ply)}, ${colourName(other(i.ownerColour))}'s ${PIECE_NAME[played.move.piece]} move ${played.move.san} forks your ${names}.`);
};

/** R57.5: the position before was not a forced mate against the Owner, the position after is a forced mate for the opponent. */
export const missedOpponentMate: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply)) return null;
  const before = i.evals[ply - 1];
  const after = i.evals[ply];
  if (!before || !after) return null;
  const matedBefore = before.kind === 'mated' || (before.kind === 'mate' && before.n < 0);
  if (matedBefore || after.kind !== 'mate' || after.n <= 0) return null;
  const reply = after.bestUci;
  const replySan = play(i.positions[ply]?.fen ?? '', reply)?.move.san;
  return make(i, 'missed-opponent-mate', ply, `After ${sanOf(i, ply)}, ${colourName(other(i.ownerColour))} has a forced mate in ${after.n}${replySan ? ` starting with ${replySan}` : ''}.`);
};

/** R57.6: a forced mate or a capture/check/fork worth 200+ centipawns more than the played move was available. */
export const missedOwnTactic: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply) || !isBad(i, ply)) return null;
  const before = i.evals[ply - 1];
  const after = i.evals[ply];
  const beforeFen = i.positions[ply - 1]?.fen;
  if (!before || !after || beforeFen === undefined) return null;
  const best = play(beforeFen, before.bestUci);
  if (before.kind === 'mate' && before.n > 0) {
    return make(i, 'missed-own-tactic', ply, `Instead of ${sanOf(i, ply)}, you had a forced mate in ${before.n}${best ? ` with ${best.move.san}` : ''}.`);
  }
  if (!best) return null;
  const forcing = best.move.captured !== undefined || best.chess.inCheck() || isFork(best.chess, best.move.to, i.ownerColour);
  if (!forcing) return null;
  if (cpFor(before) + cpFor(after) < TACTIC_MIN_GAIN_CP) return null;
  const kind = best.move.captured !== undefined ? 'capture' : best.chess.inCheck() ? 'check' : 'fork';
  return make(i, 'missed-own-tactic', ply, `Instead of ${sanOf(i, ply)}, the ${kind} ${best.move.san} was much stronger.`);
};

/** R57.7: no castling in the Owner's first 12 moves and the king still on its start square after the 12th. */
export const delayedCastling: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply)) return null;
  const mine = ownerPlies(i);
  if (mine[DETECTOR.CASTLING_BY_OWNER_MOVE - 1] !== ply) return null;
  const castled = mine.slice(0, DETECTOR.CASTLING_BY_OWNER_MOVE).some((p) => /^O-O/.test(i.positions[p]?.move?.san ?? ''));
  if (castled) return null;
  const home = i.ownerColour === 'w' ? 'e1' : 'e8';
  const piece = new Chess(i.positions[ply]?.fen).get(home as never);
  if (piece?.type !== 'k' || piece.color !== i.ownerColour) return null;
  return make(i, 'delayed-castling', ply, `You had not castled by move ${DETECTOR.CASTLING_BY_OWNER_MOVE}; your king is still on ${home}.`);
};

/** R57.8: the first non-capturing queen move within the Owner's first 5 moves. */
export const earlyQueen: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply)) return null;
  const first = ownerPlies(i)
    .slice(0, DETECTOR.EARLY_QUEEN_OWNER_MOVES)
    .find((p) => i.positions[p]?.move?.piece === 'q' && i.positions[p]?.move?.captured === undefined);
  if (first !== ply) return null;
  return make(i, 'early-queen', ply, `You moved your queen early with ${sanOf(i, ply)}, before developing your minor pieces.`);
};

/** R57.9: a mistake in the endgame, or the first endgame move when a winning position (W ≥ 75) ended in a draw or loss. */
export const endgameTechnique: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply)) return null;
  const beforeFen = i.positions[ply - 1]?.fen;
  if (beforeFen === undefined || gamePhase(beforeFen) !== 'endgame') return null;
  if (isBad(i, ply)) return make(i, 'endgame-technique', ply, `${sanOf(i, ply)} was a mistake in the endgame.`);
  if (i.ownerResult !== 'draw' && i.ownerResult !== 'loss') return null;
  const firstIndex = i.positions.findIndex((p) => gamePhase(p.fen) === 'endgame');
  const firstOwnerPly = ownerPlies(i).find((p) => p - 1 >= firstIndex);
  if (firstOwnerPly !== ply) return null;
  const e = i.evals[firstIndex];
  if (!e) return null;
  const toMove = i.positions[firstIndex]?.fen.split(' ')[1];
  const w = toMove === i.ownerColour ? winProbOf(e) : 100 - winProbOf(e);
  if (w < DETECTOR.ENDGAME_WINNING_W) return null;
  return make(i, 'endgame-technique', ply, `You were clearly better when the endgame began, but the game ended in a ${i.ownerResult}.`);
};

/** R57.10: a mistake or blunder with less than 10 % of the base time left. */
export const timePressure: Detector = (i, ply) => {
  if (!isOwnerPly(i, ply) || !isBad(i, ply) || i.timeClass === 'daily') return null;
  const left = i.clocks[ply];
  const base = baseSeconds(i.timeControl);
  if (left === undefined || base === undefined || left >= DETECTOR.TIME_PRESSURE_FRACTION * base) return null;
  return make(i, 'time-pressure', ply, `${sanOf(i, ply)} was played with only ${left} seconds left on the clock.`);
};

function ownerPlies(i: DetectorInput): number[] {
  const out: number[] = [];
  for (let p = 1; p < i.positions.length; p++) if (isOwnerPly(i, p)) out.push(p);
  return out;
}

/** In the order of DETECTOR_IDS (R57.11). */
export const DETECTORS: Record<DetectorId, Detector> = {
  'hanging-piece': hangingPiece,
  'missed-opponent-fork': missedOpponentFork,
  'missed-opponent-mate': missedOpponentMate,
  'missed-own-tactic': missedOwnTactic,
  'delayed-castling': delayedCastling,
  'early-queen': earlyQueen,
  'endgame-technique': endgameTechnique,
  'time-pressure': timePressure,
};

/** Every detection of the game, sorted by ply then detector order. Deterministic and Owner-only. */
export function runDetectors(i: DetectorInput): Detection[] {
  const out: Detection[] = [];
  for (let ply = 1; ply < i.positions.length; ply++) {
    for (const id of DETECTOR_IDS) {
      const d = DETECTORS[id](i, ply);
      if (d) out.push(d);
    }
  }
  return out;
}
