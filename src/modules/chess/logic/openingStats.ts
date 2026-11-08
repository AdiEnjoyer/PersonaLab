import { Chess } from 'chess.js';
import { round } from '../../../core/math/round';
import { addDays, type LocalDate } from '../../../core/time/localDate';
import { SM2 } from '../constants';
import type { Colour, GameRecord, MoveNode, RepertoireTree, ReviewRecord } from '../types';
import { indexTree, ownerPositions } from './repertoire';
import type { SrsState } from './sm2';
import { openingName } from './sync';

/** The main-line moves of a PGN as UCI strings, or null when chess.js cannot read it. */
export function gameMovesUci(pgn: string): string[] | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
  } catch {
    return null;
  }
}

export type ExitReason = 'line ended' | 'Owner left' | 'opponent left' | 'ended in repertoire';

export interface GameMatch {
  treeId: string;
  /** Plies shared with the tree. */
  k: number;
  exitPly?: number;
  reason: ExitReason;
  /** Key-bearing node: where the game left the tree (R54.4). */
  atNode: string | null;
}

/** Matches a game to the tree of the Owner's colour with the longest shared prefix; earliest-created wins a tie (R54.3, R54.4). */
export function matchGame(moves: readonly string[], ownerColour: Colour, trees: readonly RepertoireTree[]): GameMatch | null {
  let best: { tree: RepertoireTree; k: number; at: string | null; childCount: number } | null = null;
  for (const tree of [...trees].filter((t) => t.colour === ownerColour).sort((a, b) => a.createdAt - b.createdAt)) {
    const idx = indexTree(tree);
    let at: string | null = null;
    let k = 0;
    for (const uci of moves) {
      const next: MoveNode | undefined = (idx.children.get(at) ?? []).find((n) => n.uci === uci);
      if (next === undefined) break;
      at = next.id;
      k++;
    }
    if (k > 0 && (best === null || k > best.k)) best = { tree, k, at, childCount: (idx.children.get(at) ?? []).length };
  }
  if (best === null) return null;
  const { tree, k, at, childCount } = best;
  if (moves.length <= k) return { treeId: tree.id, k, reason: 'ended in repertoire', atNode: at };
  // Ply k + 1 is the Owner's when the Owner has the move after k plies.
  const ownerMoves = (k % 2 === 0) === (ownerColour === 'w');
  const reason: ExitReason = childCount === 0 ? 'line ended' : ownerMoves ? 'Owner left' : 'opponent left';
  return { treeId: tree.id, k, exitPly: k + 1, reason, atNode: at };
}

export interface ScoreRow {
  name: string;
  games: number;
  /** Whole percent, undefined when no game counts (shown as "—"). */
  score?: number;
}

/** 100 x (wins + 0.5 draws) over decided games, rounded; "unknown" results excluded (R54.5). */
export function scoreOf(results: readonly GameRecord['ownerResult'][]): number | undefined {
  const wins = results.filter((r) => r === 'win').length;
  const draws = results.filter((r) => r === 'draw').length;
  const losses = results.filter((r) => r === 'loss').length;
  const counted = wins + draws + losses;
  return counted === 0 ? undefined : round((100 * (wins + 0.5 * draws)) / counted);
}

const byGamesThenName = (a: ScoreRow, b: ScoreRow): number => b.games - a.games || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** One row per Chess.com opening name over the given games (R54.5). */
export function nameRows(games: readonly GameRecord[]): ScoreRow[] {
  const groups = new Map<string, GameRecord['ownerResult'][]>();
  for (const g of games) {
    const name = openingName(g.eco);
    groups.set(name, [...(groups.get(name) ?? []), g.ownerResult]);
  }
  return [...groups].map(([name, results]) => ({ name, games: results.length, ...optionalScore(results) })).sort(byGamesThenName);
}

const optionalScore = (results: readonly GameRecord['ownerResult'][]): { score?: number } => {
  const score = scoreOf(results);
  return score === undefined ? {} : { score };
};

/** Matched games and score per tree (R54.3, R54.5). Games with an unreadable PGN match nothing. */
export function treeScores(games: readonly GameRecord[], trees: readonly RepertoireTree[]): Map<string, ScoreRow> {
  const groups = new Map<string, GameRecord['ownerResult'][]>();
  for (const g of games) {
    if (g.pgnUnreadable) continue;
    const moves = gameMovesUci(g.pgn);
    if (moves === null) continue;
    const match = matchGame(moves, g.ownerColour, trees);
    if (match !== null) groups.set(match.treeId, [...(groups.get(match.treeId) ?? []), g.ownerResult]);
  }
  const out = new Map<string, ScoreRow>();
  for (const tree of trees) {
    const results = groups.get(tree.id) ?? [];
    out.set(tree.id, { name: tree.name, games: results.length, ...optionalScore(results) });
  }
  return out;
}

/** First-try accuracy of the drill reviews of the last 30 days for the tree's positions (R54.1). */
export function treeAccuracy(reviews: readonly ReviewRecord[], tree: RepertoireTree, today: LocalDate): number | undefined {
  const keys = new Set(ownerPositions(tree).map((p) => p.posKey));
  const from = addDays(today, -29);
  const inTree = reviews.filter((r) => r.date >= from && r.date <= today && keys.has(r.posKey));
  if (inTree.length === 0) return undefined;
  return round((100 * inTree.filter((r) => r.q === 5).length) / inTree.length);
}

/** Share of the tree's positions with an interval of at least 21 days (R54.2). */
export function mastery(tree: RepertoireTree, srs: ReadonlyMap<string, SrsState>): number | undefined {
  const positions = ownerPositions(tree);
  if (positions.length === 0) return undefined;
  const mastered = positions.filter((p) => (srs.get(p.posKey)?.I ?? 0) >= SM2.MASTERY_DAYS).length;
  return round((100 * mastered) / positions.length);
}

