import { Chess, type Move } from 'chess.js';
import type { Colour } from '../../types';

export interface PositionInfo {
  /** Position after the move (index 0: the start position). */
  fen: string;
  /** The move leading to this position; absent at index 0. */
  move?: {
    uci: string;
    san: string;
    from: string;
    to: string;
    piece: string;
    captured?: string;
    promotion?: string;
    colour: Colour;
  };
  terminal?: 'checkmate' | 'draw';
}

function terminalOf(chess: Chess): PositionInfo['terminal'] {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition() || chess.isDrawByFiftyMoves()) return 'draw';
  return undefined;
}

/** The P + 1 positions of a PGN main line with the move leading to each, or null when chess.js cannot read it (R55.2–R55.4). */
export function buildPositions(pgn: string): PositionInfo[] | null {
  let history: Move[];
  let startFen: string;
  try {
    const loaded = new Chess();
    loaded.loadPgn(pgn);
    history = loaded.history({ verbose: true });
    startFen = loaded.header().FEN ?? new Chess().fen();
  } catch {
    return null;
  }
  const live = new Chess(startFen);
  const first = terminalOf(live);
  const out: PositionInfo[] = [{ fen: live.fen(), ...(first ? { terminal: first } : {}) }];
  for (const m of history) {
    live.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    const terminal = terminalOf(live);
    out.push({
      fen: live.fen(),
      move: {
        uci: m.from + m.to + (m.promotion ?? ''),
        san: m.san,
        from: m.from,
        to: m.to,
        piece: m.piece,
        ...(m.captured ? { captured: m.captured } : {}),
        ...(m.promotion ? { promotion: m.promotion } : {}),
        colour: m.color,
      },
      ...(terminal ? { terminal } : {}),
    });
  }
  return out;
}
