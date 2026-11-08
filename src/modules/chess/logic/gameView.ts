import { Chess } from 'chess.js';
import type { GameRecord } from '../types';

export interface ViewMove {
  san: string;
  /** Position after the move. */
  fen: string;
  from: string;
  to: string;
  /** 'w' or 'b': the side that played it. */
  colour: 'w' | 'b';
}

export interface ParsedGame {
  startFen: string;
  moves: ViewMove[];
}

/** The main line of a PGN with the position after each move, or null when chess.js cannot read it. */
export function parseGame(pgn: string): ParsedGame | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history({ verbose: true }).map<ViewMove>((m) => ({ san: m.san, fen: m.after, from: m.from, to: m.to, colour: m.color }));
    return { startFen: chess.header().FEN ?? new Chess().fen(), moves };
  } catch {
    return null;
  }
}

const CLOCK = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2})(?:\.\d+)?\]/;
const TOKEN = /\{[^}]*\}|\([^)]*\)|\$\d+|\d+\.(?:\.\.)?|1-0|0-1|1\/2-1\/2|\*|[^\s{}()]+/g;

/** Clock value (whole seconds, truncated) recorded with each main-line move, `undefined` when a move has none (R45.6). */
export function parseClocks(pgn: string): Array<number | undefined> {
  const movetext = pgn.replace(/^\s*(\[[^\]]*\]\s*)+/, '');
  const clocks: Array<number | undefined> = [];
  for (const token of movetext.match(TOKEN) ?? []) {
    if (token.startsWith('{')) {
      const m = CLOCK.exec(token);
      if (m && clocks.length > 0) clocks[clocks.length - 1] = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    } else if (/^[(*$]/.test(token) || /^\d+\./.test(token) || /^(1-0|0-1|1\/2-1\/2)$/.test(token)) {
      continue;
    } else {
      clocks.push(undefined);
    }
  }
  return clocks;
}

/** Base time in seconds of a Chess.com `time_control` ("600", "180+2"); undefined for daily ("1/86400") or unknown. */
export function baseSeconds(timeControl: string): number | undefined {
  const m = /^(\d+)(?:\+\d+)?$/.exec(timeControl);
  return m ? Number(m[1]) : undefined;
}

/** M:SS below 1 hour, H:MM:SS from 1 hour. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Both clocks at the position after `shown` plies, or null when the PGN has no clock comments or the game is
 * daily (R45.6). Each side shows its latest recorded value, or the base time before its first move.
 */
export function clocksAt(game: Pick<GameRecord, 'pgn' | 'timeClass' | 'timeControl'>, shown: number): { w: string; b: string } | null {
  if (game.timeClass === 'daily' || !/\[%clk\s/.test(game.pgn)) return null;
  const base = baseSeconds(game.timeControl);
  const clocks = parseClocks(game.pgn);
  const latest = (colour: 0 | 1): number | undefined => {
    for (let i = Math.min(shown, clocks.length) - 1; i >= 0; i -= 1) {
      if (i % 2 === colour && clocks[i] !== undefined) return clocks[i];
    }
    return base;
  };
  const w = latest(0);
  const b = latest(1);
  if (w === undefined || b === undefined) return null;
  return { w: formatClock(w), b: formatClock(b) };
}
