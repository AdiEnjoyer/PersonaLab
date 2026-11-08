import { round } from '../../../core/math/round';
import { GLICKO } from '../constants';

export interface G2 {
  rating: number;
  rd: number;
  vol: number;
}

export interface G2Game {
  rating: number;
  rd: number;
  score: 0 | 0.5 | 1;
}

export interface G2Options {
  tau: number;
  eps: number;
  maxIter: number;
}

export const DEFAULT_G2_OPTIONS: G2Options = { tau: GLICKO.TAU, eps: GLICKO.EPS, maxIter: GLICKO.MAX_ITER };

/** The volatility iteration did not converge within the allowed number of steps. */
export class Glicko2NonConvergence extends Error {
  override readonly name = 'Glicko2NonConvergence';
}

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/**
 * One Glicko-2 rating period (Glickman, "Example of the Glicko-2 system"), unrounded. No rating-deviation
 * growth for idle time is applied (R49.3); the caller clamps the deviation (R49.4).
 */
export function glicko2(player: G2, games: readonly G2Game[], o: G2Options = DEFAULT_G2_OPTIONS): G2 & { iterations: number } {
  const mu = (player.rating - 1500) / GLICKO.SCALE;
  const phi = player.rd / GLICKO.SCALE;
  const sigma = player.vol;
  if (games.length === 0) return { ...player, iterations: 0 };

  let vInv = 0;
  let sum = 0;
  for (const game of games) {
    const muJ = (game.rating - 1500) / GLICKO.SCALE;
    const gj = g(game.rd / GLICKO.SCALE);
    const e = 1 / (1 + Math.exp(-gj * (mu - muJ)));
    vInv += gj * gj * e * (1 - e);
    sum += gj * (game.score - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;

  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (o.tau * o.tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * o.tau) < 0) k++;
    B = a - k * o.tau;
  }
  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > o.eps) {
    if (iterations >= o.maxIter) throw new Glicko2NonConvergence(`Volatility iteration did not converge in ${o.maxIter} steps.`);
    iterations++;
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * sum;
  return { rating: GLICKO.SCALE * newMu + 1500, rd: GLICKO.SCALE * newPhi, vol: newSigma, iterations };
}

export const clampRd = (rd: number): number => Math.min(GLICKO.RD_MAX, Math.max(GLICKO.RD_MIN, rd));

/** The Puzzle_Rating after one scored puzzle: a one-game period, deviation clamped (R49.3, R49.4). */
export function updatePuzzleRating(before: G2, puzzle: { rating: number; rd: number }, score: 0 | 1): G2 {
  const after = glicko2(before, [{ rating: puzzle.rating, rd: puzzle.rd, score }]);
  return { rating: after.rating, rd: clampRd(after.rd), vol: after.vol };
}

export const initialPuzzleRating = (chessRating: number): G2 => ({ rating: chessRating, rd: GLICKO.INIT_RD, vol: GLICKO.INIT_VOL });

/** Whole-number display of a rating (R49.8). */
export const displayRating = (rating: number): number => round(rating);

export const isProvisional = (rd: number): boolean => rd > GLICKO.PROVISIONAL_RD;
