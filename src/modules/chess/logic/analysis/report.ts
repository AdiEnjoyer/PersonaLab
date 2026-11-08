import { Chess } from 'chess.js';
import { DETECTOR_IDS } from '../../constants';
import type { Colour, DetectorId, OwnerResult, RatingBand, Tip } from '../../types';
import { classifyMove, type MoveLabel } from './classify';
import { runDetectors, type Detection, type DetectorInput, type EvalInfo } from './detectors';
import type { PositionInfo } from './positions';
import { winProbOf } from './winProb';

export interface KeyMistake {
  ply: number;
  /** "14." for a White move, "14…" for a Black move. */
  moveNo: string;
  san: string;
  wBefore: number;
  wAfter: number;
  /** Engine best move in SAN followed by the next principal-variation moves, up to 3 in total. */
  better: string[];
  detectors: DetectorId[];
  /** One general sentence about why the move was bad. */
  explanation: string;
}

export interface GameReport {
  gameId: string;
  depth: number;
  version: number;
  createdAt: number;
  counts: { inaccuracy: number; mistake: number; blunder: number };
  labels: Array<{ ply: number; label: Exclude<MoveLabel, null>; drop: number; bestSan?: string }>;
  keyMistakes: KeyMistake[];
  detections: Detection[];
  tipIds: string[];
  band: RatingBand;
}

export interface ReportInput {
  gameId: string;
  depth: number;
  version: number;
  createdAt: number;
  positions: PositionInfo[];
  evals: Array<EvalInfo | undefined>;
  /** Seconds left after each ply; index = ply (1-based). */
  clocks: Array<number | undefined>;
  timeControl: string;
  timeClass: string;
  ownerColour: Colour;
  ownerResult: OwnerResult;
  tips: readonly Tip[];
  band: RatingBand;
}

const KEY_MISTAKES = 3;

/** SAN of a UCI line replayed from `fen`, stopping at the first illegal move. */
function sanLine(fen: string, ucis: string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of ucis) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }).san);
    } catch {
      break;
    }
  }
  return out;
}

const generalExplanation = (drop: number): string =>
  `This move gave away about ${Math.round(drop)} percentage points of winning chances compared with the engine's choice.`;

/** Tips of the band for a game (R58.4): detector-tagged first, then untagged, then any; no duplicates. */
export function selectReportTips(tips: readonly Tip[], band: RatingBand, detections: readonly Detection[]): string[] {
  const count = detections.length > 0 ? 3 : 2;
  const pool = tips.filter((t) => t.band === band);
  const fired = DETECTOR_IDS.map((id, order) => ({ id, order, n: detections.filter((d) => d.detector === id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.order - b.order);
  const chosen: Tip[] = [];
  const add = (t: Tip): void => {
    if (chosen.length < count && !chosen.includes(t)) chosen.push(t);
  };
  for (const f of fired) pool.filter((t) => t.detectors.includes(f.id)).forEach(add);
  pool.filter((t) => t.detectors.length === 0).forEach(add);
  pool.forEach(add);
  return chosen.map((t) => t.id);
}

/** Builds the Game_Report from per-position evaluations (R58). Pure; Owner moves only. */
export function buildReport(i: ReportInput): GameReport {
  const labels: MoveLabel[] = [null];
  const drops: number[] = [0];
  const reportLabels: GameReport['labels'] = [];
  const counts = { inaccuracy: 0, mistake: 0, blunder: 0 };
  for (let ply = 1; ply < i.positions.length; ply++) {
    const move = i.positions[ply]?.move;
    if (move === undefined || move.colour !== i.ownerColour) {
      labels.push(null);
      drops.push(0);
      continue;
    }
    const c = classifyMove(i.evals[ply - 1], i.evals[ply], move.uci);
    const label = c.evaluated ? c.label : null;
    labels.push(label);
    drops.push(c.evaluated ? c.drop : 0);
    if (c.evaluated && label !== null) {
      counts[label]++;
      const best = i.evals[ply - 1]?.bestUci;
      const bestSan = best === undefined ? undefined : sanLine(i.positions[ply - 1]?.fen ?? '', [best])[0];
      reportLabels.push({ ply, label, drop: c.drop, ...(bestSan ? { bestSan } : {}) });
    }
  }

  const input: DetectorInput = {
    positions: i.positions,
    evals: i.evals,
    labels,
    clocks: i.clocks,
    timeControl: i.timeControl,
    timeClass: i.timeClass,
    ownerColour: i.ownerColour,
    ownerResult: i.ownerResult,
  };
  const detections = runDetectors(input);

  const keyMistakes = reportLabels
    .filter((l) => l.label === 'mistake' || l.label === 'blunder')
    .sort((a, b) => b.drop - a.drop || a.ply - b.ply)
    .slice(0, KEY_MISTAKES)
    .sort((a, b) => a.ply - b.ply)
    .map<KeyMistake>((l) => {
      const before = i.evals[l.ply - 1];
      const after = i.evals[l.ply];
      const move = i.positions[l.ply]?.move;
      const fired = detections.filter((d) => d.ply === l.ply);
      const pv = before?.pv ?? [];
      const best = before?.bestUci;
      const line = best === undefined ? [] : [best, ...(pv[0] === best ? pv.slice(1) : pv)].slice(0, 3);
      const fullMove = Math.ceil(l.ply / 2);
      return {
        ply: l.ply,
        moveNo: move?.colour === 'w' ? `${fullMove}.` : `${fullMove}…`,
        san: move?.san ?? '',
        wBefore: before ? Math.round(winProbOf(before)) : 0,
        wAfter: after ? Math.round(100 - winProbOf(after)) : 0,
        better: sanLine(i.positions[l.ply - 1]?.fen ?? '', line),
        detectors: fired.map((d) => d.detector),
        explanation: fired[0]?.explanation ?? generalExplanation(l.drop),
      };
    });

  return {
    gameId: i.gameId,
    depth: i.depth,
    version: i.version,
    createdAt: i.createdAt,
    counts,
    labels: reportLabels,
    keyMistakes,
    detections,
    tipIds: selectReportTips(i.tips, i.band, detections),
    band: i.band,
  };
}
