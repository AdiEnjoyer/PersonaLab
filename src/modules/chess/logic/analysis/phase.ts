import { PHASE } from '../../constants';

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

/** Queens, rooks, bishops and knights of both sides in a FEN. */
export function countPieces(fen: string): number {
  const placement = fen.split(' ')[0] ?? '';
  let n = 0;
  for (const ch of placement) if ('qrbnQRBN'.includes(ch)) n++;
  return n;
}

/** Game_Phase of a position (R57.1): endgame at 6 or fewer queens/rooks/bishops/knights, else opening up to full move 12. */
export function gamePhase(fen: string): GamePhase {
  if (countPieces(fen) <= PHASE.ENDGAME_MAX_MINORS_MAJORS) return 'endgame';
  const fullMove = Number(fen.split(' ')[5] ?? '1');
  return fullMove <= PHASE.OPENING_MAX_FULLMOVE ? 'opening' : 'middlegame';
}
