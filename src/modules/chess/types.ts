import type { LocalDate } from '../../core/time/localDate';
import type { DETECTOR_IDS, RATING_BANDS } from './constants';

export type Colour = 'w' | 'b';
export type RatingBand = (typeof RATING_BANDS)[number];
export type DetectorId = (typeof DETECTOR_IDS)[number];
export type OwnerResult = 'win' | 'loss' | 'draw' | 'unknown';

export interface GamePlayer {
  username: string;
  rating?: number;
  result: string;
}

/** `chess_games` (id = idemKey). */
export interface GameRecord {
  id: string;
  idemKey: string;
  uuid?: string;
  url?: string;
  pgn: string;
  timeClass: string;
  timeControl: string;
  /** Unix seconds. */
  endTime: number;
  rated: boolean;
  white: GamePlayer;
  black: GamePlayer;
  eco?: string;
  /** Lower-case username the game was synced for. */
  syncedFor: string;
  ownerColour: Colour;
  ownerResult: OwnerResult;
  pgnUnreadable: boolean;
}

export interface SyncState {
  /** Lower-case. */
  username: string;
  /** 'YYYY/MM' */
  monthsComplete: string[];
  lastSuccessAt?: number;
}

export interface ChessComRatings {
  id: 'chesscom';
  rapid?: number;
  blitz?: number;
  bullet?: number;
  tacticsHigh?: number;
  tacticsLow?: number;
  fetchedAt: number;
}

export interface PuzzleRatingRecord {
  id: 'puzzle';
  rating: number;
  rd: number;
  vol: number;
}

export interface PuzzleAttempt {
  id: string;
  idemKey: string;
  puzzleId: string;
  ts: number;
  score: 0 | 1;
  hintsUsed: number;
  rated: boolean;
  before: { rating: number; rd: number; vol: number };
  after: { rating: number; rd: number; vol: number };
}

export interface Tip {
  id: string;
  band: RatingBand;
  topics: string[];
  title: string;
  body: string;
  detectors: DetectorId[];
}

export interface TipState {
  id: 'tips';
  dailyDate?: LocalDate;
  dailyTipId?: string;
  shown: Partial<Record<RatingBand, string[]>>;
}

export interface MoveNode {
  id: string;
  parentId: string | null;
  uci: string;
  san: string;
  explanation?: string;
  seq: number;
}

export interface RepertoireTree {
  id: string;
  name: string;
  colour: Colour;
  createdAt: number;
  nodes: MoveNode[];
  nextSeq: number;
}

export interface SrsRecord {
  posKey: string;
  E: number;
  n: number;
  I: number;
  due?: LocalDate;
}

export interface ReviewRecord {
  id: string;
  posKey: string;
  date: LocalDate;
  q: number;
}

export type StoredEval = { kind: 'cp'; cp: number } | { kind: 'mate'; n: number } | { kind: 'mated' } | { kind: 'draw' };

export interface EvalRecord {
  gameId: string;
  depth: number;
  version: number;
  /** Position index 0…P. */
  ply: number;
  eval: StoredEval;
  bestUci?: string;
  pv?: string[];
}

/** `chess_reports` (key gameId). The analysis step defines the full report; unknown fields are kept as stored. */
export interface ReportRecord {
  gameId: string;
  depth: number;
  version: number;
  createdAt: number;
  [field: string]: unknown;
}

export interface ChessBackupData {
  games: GameRecord[];
  syncState: SyncState[];
  ratings: ChessComRatings[];
  puzzleAttempts: PuzzleAttempt[];
  puzzleRating: PuzzleRatingRecord[];
  trees: RepertoireTree[];
  srs: SrsRecord[];
  reviews: ReviewRecord[];
  tipState: TipState[];
  evals: EvalRecord[];
  reports: ReportRecord[];
}
