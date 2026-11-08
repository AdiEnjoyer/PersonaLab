import { WIN_K } from '../../constants';
import type { StoredEval } from '../../types';

/** Win_Probability in percent (0–100, unrounded) for an evaluation of `cp` centipawns for the side to move (R56.1). */
export function winProb(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_K * cp)) - 1);
}

/** Win_Probability of a stored evaluation: mate for the mover 100, mated 0, draw 50 (R56.2). */
export function winProbOf(e: StoredEval): number {
  switch (e.kind) {
    case 'cp':
      return winProb(e.cp);
    case 'mate':
      return e.n > 0 ? 100 : 0;
    case 'mated':
      return 0;
    case 'draw':
      return 50;
  }
}
