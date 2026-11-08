import { z } from 'zod';
import { DETECTOR_IDS, RATING_BANDS } from './constants';

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const colour = z.enum(['w', 'b']);
const glicko = z.strictObject({ rating: z.number(), rd: z.number(), vol: z.number() });

const GamePlayerSchema = z.strictObject({ username: z.string(), rating: z.number().optional(), result: z.string() });

export const GameRecordSchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  uuid: z.string().optional(),
  url: z.string().optional(),
  pgn: z.string(),
  timeClass: z.string(),
  timeControl: z.string(),
  endTime: z.number(),
  rated: z.boolean(),
  white: GamePlayerSchema,
  black: GamePlayerSchema,
  eco: z.string().optional(),
  syncedFor: z.string(),
  ownerColour: colour,
  ownerResult: z.enum(['win', 'loss', 'draw', 'unknown']),
  pgnUnreadable: z.boolean(),
});

export const SyncStateSchema = z.strictObject({
  username: z.string().min(1),
  monthsComplete: z.array(z.string().regex(/^\d{4}\/\d{2}$/)),
  lastSuccessAt: z.number().optional(),
});

export const ChessComRatingsSchema = z.strictObject({
  id: z.literal('chesscom'),
  rapid: z.number().optional(),
  blitz: z.number().optional(),
  bullet: z.number().optional(),
  tacticsHigh: z.number().optional(),
  tacticsLow: z.number().optional(),
  fetchedAt: z.number(),
});

export const PuzzleAttemptSchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  puzzleId: z.string(),
  ts: z.number(),
  score: z.union([z.literal(0), z.literal(1)]),
  hintsUsed: z.number().int().min(0),
  rated: z.boolean(),
  before: glicko,
  after: glicko,
});

export const PuzzleRatingSchema = z.strictObject({ id: z.literal('puzzle'), rating: z.number(), rd: z.number(), vol: z.number() });

export const MoveNodeSchema = z.strictObject({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  uci: z.string(),
  san: z.string(),
  explanation: z.string().optional(),
  seq: z.number().int(),
});

export const RepertoireTreeSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  colour,
  createdAt: z.number(),
  nodes: z.array(MoveNodeSchema),
  nextSeq: z.number().int(),
});

export const SrsSchema = z.strictObject({
  posKey: z.string().min(1),
  E: z.number(),
  n: z.number().int(),
  I: z.number(),
  due: localDate.optional(),
});

export const ReviewSchema = z.strictObject({ id: z.string().min(1), posKey: z.string(), date: localDate, q: z.number() });

export const TipStateSchema = z.strictObject({
  id: z.literal('tips'),
  dailyDate: localDate.optional(),
  dailyTipId: z.string().optional(),
  shown: z.partialRecord(z.enum(RATING_BANDS), z.array(z.string())),
});

export const StoredEvalSchema = z.union([
  z.strictObject({ kind: z.literal('cp'), cp: z.number() }),
  z.strictObject({ kind: z.literal('mate'), n: z.number() }),
  z.strictObject({ kind: z.literal('mated') }),
  z.strictObject({ kind: z.literal('draw') }),
]);

export const EvalRecordSchema = z.strictObject({
  gameId: z.string().min(1),
  depth: z.number().int(),
  version: z.number().int(),
  ply: z.number().int().min(0),
  eval: StoredEvalSchema,
  bestUci: z.string().optional(),
  pv: z.array(z.string()).optional(),
});

/** The report shape is owned by the analysis step; the base fields are checked and the rest is kept. */
export const ReportRecordSchema = z.looseObject({
  gameId: z.string().min(1),
  depth: z.number(),
  version: z.number(),
  createdAt: z.number(),
});

/** Chess backup data, data version 1. */
export const ChessBackupDataSchema = z.strictObject({
  games: z.array(GameRecordSchema),
  syncState: z.array(SyncStateSchema),
  ratings: z.array(ChessComRatingsSchema),
  puzzleAttempts: z.array(PuzzleAttemptSchema),
  puzzleRating: z.array(PuzzleRatingSchema),
  trees: z.array(RepertoireTreeSchema),
  srs: z.array(SrsSchema),
  reviews: z.array(ReviewSchema),
  tipState: z.array(TipStateSchema),
  evals: z.array(EvalRecordSchema),
  reports: z.array(ReportRecordSchema),
});

/** `public/data/puzzles.json` (R47.5). */
export const PuzzleSchema = z.strictObject({
  id: z.string().min(1),
  fen: z.string().min(1),
  moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).min(2),
  rating: z.number(),
  rd: z.number(),
  themes: z.array(z.string()),
});
export const PuzzlesFileSchema = z.array(PuzzleSchema);

/** `public/data/tips.json` (R41.1). */
export const TipSchema = z.strictObject({
  id: z.string().min(1),
  band: z.enum(RATING_BANDS),
  topics: z.array(z.string().min(1)).min(1),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(800),
  detectors: z.array(z.enum(DETECTOR_IDS)),
});
export const TipsFileSchema = z.array(TipSchema);

/** public/data/repertoire-starter.json (R51.1): authored lines of SAN moves, each optionally followed by  # note. */
export const StarterFileSchema = z.strictObject({
  trees: z.array(z.strictObject({ name: z.string().min(1).max(60), colour, lines: z.array(z.array(z.string().min(1)).min(1)).min(1) })).min(1),
});
