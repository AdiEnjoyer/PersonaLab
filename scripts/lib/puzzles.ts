import { createReadStream } from 'node:fs';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { Chess } from 'chess.js';
import type { Puzzle } from '../../src/modules/chess/types';

// Puzzle data build (R47): streaming CSV reader, candidate filters, chess.js replay, bucketed deterministic selection.

export const RATING_MIN = 700;
export const RATING_MAX = 1600;
export const BUCKETS = 9;
export const MAX_PUZZLES = 10_000;
export const PER_BUCKET = Math.floor(MAX_PUZZLES / BUCKETS); // 1,111
export const MAX_GZIP_BYTES = 3_145_728;

export interface BuildParams {
  minPopularity: number;
  minPlays: number;
  perBucket: number;
}

export const DEFAULT_PARAMS: BuildParams = { minPopularity: 80, minPlays: 500, perBucket: PER_BUCKET };

export const REASON_MALFORMED = 'malformed row';
export const REASON_ILLEGAL = 'illegal moves';

export interface BuildStats {
  rowsRead: number;
  /** Rows that were well formed but outside the rating range or below the popularity / plays minimums. */
  filteredOut: number;
  excluded: Record<string, number>;
  /** Puzzles written per bucket 700–799 … 1500–1600. */
  written: number[];
}

interface Candidate {
  puzzle: Puzzle;
  popularity: number;
  plays: number;
}

/** Splits one CSV line; double quotes may wrap a field and `""` is an escaped quote. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      fields.push(field);
      field = '';
    } else field += c;
  }
  fields.push(field);
  return fields;
}

const INTEGER = /^-?\d+$/;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export const bucketOf = (rating: number): number => Math.min(BUCKETS - 1, Math.floor((rating - RATING_MIN) / 100));

/** True when the FEN loads and every UCI move (with promotion letter) is legal in turn (R47.3). */
export function replayIsLegal(fen: string, moves: readonly string[]): boolean {
  if (!moves.every((m) => UCI.test(m))) return false;
  try {
    const chess = new Chess(fen);
    for (const m of moves) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), ...(m.length > 4 ? { promotion: m.slice(4) } : {}) });
    return true;
  } catch {
    return false;
  }
}

type Parsed = { kind: 'malformed' } | { kind: 'ok'; candidate: Candidate };

/** Columns PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,… (R47.1, R47.2). */
export function parseRow(fields: readonly string[]): Parsed {
  const [id, fen, movesText, ratingText, rdText, popText, playsText, themesText] = fields.map((f) => f.trim());
  if (!id || !fen || ratingText === undefined || !INTEGER.test(ratingText)) return { kind: 'malformed' };
  const rd = rdText === undefined || rdText === '' ? NaN : Number(rdText);
  if (!(rd > 0) || !Number.isFinite(rd)) return { kind: 'malformed' };
  const moves = (movesText ?? '').split(/\s+/).filter(Boolean);
  if (moves.length < 2) return { kind: 'malformed' };
  return {
    kind: 'ok',
    candidate: {
      puzzle: { id, fen, moves, rating: Number(ratingText), rd, themes: (themesText ?? '').split(/\s+/).filter(Boolean) },
      popularity: popText === undefined ? NaN : Number(popText),
      plays: playsText === undefined ? NaN : Number(playsText),
    },
  };
}

/** Popularity ↓, plays ↓, id ↑ (R47.4). A total order, so the choice never depends on the input order. */
const better = (a: Candidate, b: Candidate): number =>
  b.popularity - a.popularity || b.plays - a.plays || (a.puzzle.id < b.puzzle.id ? -1 : a.puzzle.id > b.puzzle.id ? 1 : 0);

/**
 * Reads CSV lines (the header line is skipped) and returns the selected puzzles sorted by rating ↑ then id ↑,
 * with the statistics of R47.6. Every candidate is replayed before selection; each bucket keeps its best
 * `perBucket` valid candidates and gives nothing to other buckets.
 */
export async function selectPuzzles(
  lines: AsyncIterable<string> | Iterable<string>,
  params: BuildParams = DEFAULT_PARAMS,
): Promise<{ puzzles: Puzzle[]; stats: BuildStats }> {
  const stats: BuildStats = { rowsRead: 0, filteredOut: 0, excluded: { [REASON_MALFORMED]: 0, [REASON_ILLEGAL]: 0 }, written: [] };
  const buckets: Candidate[][] = Array.from({ length: BUCKETS }, () => []);
  const prune = (list: Candidate[]): void => {
    list.sort(better);
    list.length = Math.min(list.length, params.perBucket);
  };
  let first = true;
  for await (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    if (first) {
      first = false;
      if (line.startsWith('PuzzleId')) continue;
    }
    stats.rowsRead++;
    const parsed = parseRow(parseCsvLine(line));
    if (parsed.kind === 'malformed') {
      stats.excluded[REASON_MALFORMED]!++;
      continue;
    }
    const c = parsed.candidate;
    const { rating } = c.puzzle;
    if (rating < RATING_MIN || rating > RATING_MAX || !(c.popularity >= params.minPopularity) || !(c.plays >= params.minPlays)) {
      stats.filteredOut++;
      continue;
    }
    if (!replayIsLegal(c.puzzle.fen, c.puzzle.moves)) {
      stats.excluded[REASON_ILLEGAL]!++;
      continue;
    }
    const list = buckets[bucketOf(rating)]!;
    list.push(c);
    if (list.length >= params.perBucket * 4 + 64) prune(list);
  }
  const puzzles: Puzzle[] = [];
  for (const list of buckets) {
    prune(list);
    stats.written.push(list.length);
    for (const c of list) puzzles.push(c.puzzle);
  }
  puzzles.sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { puzzles, stats };
}

/** Compact JSON with a fixed key order and a trailing newline: byte-identical for identical input (R47.7). */
export const serialisePuzzles = (puzzles: readonly Puzzle[]): string =>
  `${JSON.stringify(puzzles.map((p) => ({ id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, rd: p.rd, themes: p.themes })))}\n`;

export const gzipSize = (text: string): number => gzipSync(text, { level: 9 }).length;

export const bucketLabel = (i: number): string => `${RATING_MIN + 100 * i}–${i === BUCKETS - 1 ? RATING_MAX : RATING_MIN + 100 * i + 99}`;

export function lineReader(input: Readable): AsyncIterable<string> {
  return createInterface({ input, crlfDelay: Infinity });
}

export interface BuildOptions {
  /** A `.csv` path, or a stream such as decompressed stdin. */
  input: string | Readable;
  out: string;
  params?: BuildParams;
  log?: (line: string) => void;
}

export type BuildResult = { ok: true; stats: BuildStats; count: number; gzipBytes: number } | { ok: false; reason: string };

/** Builds the puzzle file. On any failure the previous output file stays untouched (R47.8). */
export async function buildPuzzles(options: BuildOptions): Promise<BuildResult> {
  const log = options.log ?? (() => undefined);
  const params = options.params ?? DEFAULT_PARAMS;
  let result: { puzzles: Puzzle[]; stats: BuildStats };
  try {
    if (typeof options.input === 'string') {
      await access(options.input);
      const stream = createReadStream(options.input);
      // A missing file raises on the stream; the reader below surfaces it.
      result = await selectPuzzles(lineReader(stream), params);
    } else {
      result = await selectPuzzles(lineReader(options.input), params);
    }
  } catch (error) {
    return { ok: false, reason: `The input could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  const { puzzles, stats } = result;
  if (puzzles.length > MAX_PUZZLES) return { ok: false, reason: `${puzzles.length} puzzles exceed the limit of ${MAX_PUZZLES}.` };
  const text = serialisePuzzles(puzzles);
  const gzipBytes = gzipSize(text);
  if (gzipBytes > MAX_GZIP_BYTES) return { ok: false, reason: `The gzip size ${gzipBytes} bytes exceeds ${MAX_GZIP_BYTES} bytes.` };
  const tmp = `${options.out}.tmp`;
  try {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(tmp, text, 'utf8');
    await rename(tmp, options.out);
  } catch (error) {
    await rm(tmp, { force: true });
    return { ok: false, reason: `The output could not be written: ${error instanceof Error ? error.message : String(error)}` };
  }
  log(`Rows read: ${stats.rowsRead}`);
  log(`Rows outside the filters: ${stats.filteredOut}`);
  stats.written.forEach((n, i) => log(`Bucket ${bucketLabel(i)}: ${n} puzzles`));
  for (const [reason, n] of Object.entries(stats.excluded)) log(`Excluded (${reason}): ${n}`);
  log(`Written: ${puzzles.length} puzzles, ${gzipBytes} bytes gzipped, to ${options.out}`);
  return { ok: true, stats, count: puzzles.length, gzipBytes };
}
