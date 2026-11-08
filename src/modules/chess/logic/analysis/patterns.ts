import { DETECTOR_IDS, DETECTOR_THEMES, PATTERN } from '../../constants';
import type { DetectorId, OwnerResult } from '../../types';
import type { Detection } from './detectors';

export interface PatternReportEntry {
  gameId: string;
  endTime: number;
  timeClass: string;
  ownerResult: OwnerResult;
  detections: Array<Pick<Detection, 'detector' | 'fullMove'>>;
}

export interface PatternInput {
  reports: readonly PatternReportEntry[];
  scope: 20 | 50 | 'all';
  timeClass: string;
}

export interface Pattern {
  detector: DetectorId;
  bucket: 0 | 1 | 2 | 3;
  basis: 'games' | 'losses';
  /** Unrounded percentage, 0–100. */
  share: number;
  numerator: number;
  denominator: number;
  text: string;
  /** Puzzle themes to practise; empty means "Read tips". */
  themes: string[];
  action: 'practice' | 'read-tips';
}

export type PatternOutput = { kind: 'too-few'; n: number } | { kind: 'patterns'; patterns: Pattern[] };

export interface Share {
  detector: DetectorId;
  bucket: 0 | 1 | 2 | 3;
  gamesWith: number;
  games: number;
  gameShare: number;
  lossesWith: number;
  losses: number;
  /** Undefined when the scope has no loss. */
  lossShare: number | undefined;
}

const PHRASE: Record<DetectorId, string> = {
  'hanging-piece': 'hang pieces',
  'missed-opponent-fork': 'miss opponent forks',
  'missed-opponent-mate': 'miss mating threats',
  'missed-own-tactic': 'miss tactics of your own',
  'delayed-castling': 'delay castling',
  'early-queen': 'bring your queen out early',
  'endgame-technique': 'slip in endgames',
  'time-pressure': 'make mistakes under time pressure',
};
const BUCKET_WORDING = ['in moves 1–10', 'in moves 11–20', 'in moves 21–30', 'after move 30'] as const;

export const bucketOf = (fullMove: number): 0 | 1 | 2 | 3 =>
  fullMove <= PATTERN.BUCKETS[0]![1] ? 0 : fullMove <= PATTERN.BUCKETS[1]![1] ? 1 : fullMove <= PATTERN.BUCKETS[2]![1] ? 2 : 3;

/** Reports in scope: time class filter, newest first, first `scope` (R59.1). */
export function scoped(input: PatternInput): PatternReportEntry[] {
  const filtered = input.reports.filter((r) => input.timeClass === 'all' || r.timeClass === input.timeClass);
  const sorted = [...filtered].sort((a, b) => b.endTime - a.endTime || (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
  return input.scope === 'all' ? sorted : sorted.slice(0, input.scope);
}

/** Game and loss share of every (detector, bucket) pair over the given games (R59.3). */
export function patternShares(games: readonly PatternReportEntry[]): Share[] {
  const losses = games.filter((g) => g.ownerResult === 'loss');
  const out: Share[] = [];
  for (const detector of DETECTOR_IDS) {
    for (const bucket of [0, 1, 2, 3] as const) {
      const has = (g: PatternReportEntry): boolean => g.detections.some((d) => d.detector === detector && bucketOf(d.fullMove) === bucket);
      const gamesWith = games.filter(has).length;
      const lossesWith = losses.filter(has).length;
      out.push({
        detector,
        bucket,
        gamesWith,
        games: games.length,
        gameShare: games.length > 0 ? (100 * gamesWith) / games.length : 0,
        lossesWith,
        losses: losses.length,
        lossShare: losses.length > 0 ? (100 * lossesWith) / losses.length : undefined,
      });
    }
  }
  return out;
}

const qualifies = (share: number, numerator: number): boolean => share >= PATTERN.MIN_SHARE && numerator >= PATTERN.MIN_NUMERATOR;

/** Cross-game recurring patterns (R59). */
export function patternReport(input: PatternInput): PatternOutput {
  const games = scoped(input);
  if (games.length < PATTERN.MIN_GAMES) return { kind: 'too-few', n: games.length };

  const patterns: Pattern[] = [];
  for (const s of patternShares(games)) {
    const gameOk = qualifies(s.gameShare, s.gamesWith);
    const lossOk = s.lossShare !== undefined && qualifies(s.lossShare, s.lossesWith);
    if (!gameOk && !lossOk) continue;
    const useLosses = lossOk && (!gameOk || (s.lossShare as number) >= s.gameShare);
    const share = useLosses ? (s.lossShare as number) : s.gameShare;
    const numerator = useLosses ? s.lossesWith : s.gamesWith;
    const denominator = useLosses ? s.losses : s.games;
    const themes = [...(DETECTOR_THEMES[s.detector as keyof typeof DETECTOR_THEMES] ?? [])];
    patterns.push({
      detector: s.detector,
      bucket: s.bucket,
      basis: useLosses ? 'losses' : 'games',
      share,
      numerator,
      denominator,
      text: `You ${PHRASE[s.detector]} ${BUCKET_WORDING[s.bucket]} in ${Math.round(share)} % of ${useLosses ? 'losses' : 'games'} (${numerator} of ${denominator})`,
      themes,
      action: themes.length > 0 ? 'practice' : 'read-tips',
    });
  }
  patterns.sort(
    (a, b) =>
      b.share - a.share || b.numerator - a.numerator || DETECTOR_IDS.indexOf(a.detector) - DETECTOR_IDS.indexOf(b.detector) || a.bucket - b.bucket,
  );
  return { kind: 'patterns', patterns };
}
