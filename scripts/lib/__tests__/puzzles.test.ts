import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPuzzles, DEFAULT_PARAMS, gzipSize, parseCsvLine, REASON_ILLEGAL, REASON_MALFORMED, selectPuzzles, serialisePuzzles } from '../puzzles';

const HEADER = 'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags';
const FEN = '6k1/5ppp/8/8/8/8/5PPP/RR4K1 b - - 0 1';
const MOVES = 'g8h8 a1a8';

interface Row {
  id: string;
  fen?: string;
  moves?: string;
  rating?: string | number;
  rd?: string | number;
  pop?: number;
  plays?: number;
  themes?: string;
}
const row = (r: Row): string =>
  [r.id, r.fen ?? FEN, r.moves ?? MOVES, r.rating ?? 800, r.rd ?? 75, r.pop ?? 90, r.plays ?? 1000, r.themes ?? 'mateIn1 short', 'https://lichess.org/x', ''].join(',');
const csv = (rows: Row[]): string[] => [HEADER, ...rows.map(row)];

describe('parseCsvLine', () => {
  it('handles quotes', () => {
    expect(parseCsvLine('a,"b,c","d""e",')).toEqual(['a', 'b,c', 'd"e', '']);
  });
});

describe('selectPuzzles', () => {
  it('applies the candidate filters, counts exclusions and splits themes', async () => {
    const lines = csv([
      { id: 'ok', rating: 800 },
      { id: 'low', rating: 699 },
      { id: 'high', rating: 1601 },
      { id: 'edgeLo', rating: 700 },
      { id: 'edgeHi', rating: 1600 },
      { id: 'unpopular', pop: 79 },
      { id: 'fewPlays', plays: 499 },
      { id: 'noRd', rd: 0 },
      { id: 'badRating', rating: 'abc' },
      { id: '', rating: 900 },
      { id: 'oneMove', moves: 'g8h8' },
      { id: 'illegal', moves: 'g8h8 a1a7 a7a8' },
      { id: 'badFen', fen: 'not a fen' },
    ]);
    const { puzzles, stats } = await selectPuzzles(lines);
    expect(puzzles.map((p) => p.id)).toEqual(['edgeLo', 'ok', 'edgeHi']);
    expect(puzzles[1]).toEqual({ id: 'ok', fen: FEN, moves: ['g8h8', 'a1a8'], rating: 800, rd: 75, themes: ['mateIn1', 'short'] });
    expect(stats.rowsRead).toBe(13);
    expect(stats.excluded[REASON_MALFORMED]).toBe(4);
    expect(stats.excluded[REASON_ILLEGAL]).toBe(2);
    expect(stats.filteredOut).toBe(4);
    expect(stats.written).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('keeps the best per bucket (popularity, plays, id) without redistribution', async () => {
    const rows: Row[] = [
      { id: 'c', rating: 810, pop: 95, plays: 900 },
      { id: 'b', rating: 820, pop: 95, plays: 900 },
      { id: 'a', rating: 830, pop: 95, plays: 2000 },
      { id: 'z', rating: 840, pop: 99, plays: 600 },
      { id: 'w', rating: 850, pop: 80, plays: 5000 },
      { id: 'other', rating: 950 },
    ];
    const { puzzles, stats } = await selectPuzzles(csv(rows), { ...DEFAULT_PARAMS, perBucket: 3 });
    expect(puzzles.map((p) => p.id)).toEqual(['b', 'a', 'z', 'other']);
    expect(stats.written.slice(0, 3)).toEqual([0, 3, 1]);
  });

  it('is independent of the input order and repeatable byte for byte', async () => {
    const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, rating: 700 + ((i * 37) % 900), pop: 80 + (i % 7), plays: 500 + (i % 5) * 10 }));
    const a = await selectPuzzles(csv(rows), { ...DEFAULT_PARAMS, perBucket: 2 });
    const b = await selectPuzzles(csv([...rows].reverse()), { ...DEFAULT_PARAMS, perBucket: 2 });
    const c = await selectPuzzles(csv(rows), { ...DEFAULT_PARAMS, perBucket: 2 });
    expect(serialisePuzzles(b.puzzles)).toBe(serialisePuzzles(a.puzzles));
    expect(serialisePuzzles(c.puzzles)).toBe(serialisePuzzles(a.puzzles));
  });

  it('reads CRLF input', async () => {
    const { puzzles } = await selectPuzzles(csv([{ id: 'x' }]).map((l) => `${l}\r`));
    expect(puzzles.map((p) => p.id)).toEqual(['x']);
  });
});

describe('buildPuzzles', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'puzzles-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const rows: Row[] = [{ id: 'a', rating: 900 }, { id: 'b', rating: 750 }, { id: 'c', rating: 1500 }];

  it('writes identical bytes from a file and from a stream, with a printed summary', async () => {
    const input = path.join(dir, 'in.csv');
    await writeFile(input, `${csv(rows).join('\n')}\n`);
    const logs: string[] = [];
    const fromFile = await buildPuzzles({ input, out: path.join(dir, 'a.json'), log: (l) => logs.push(l) });
    const fromStream = await buildPuzzles({ input: Readable.from([`${csv(rows).join('\r\n')}\r\n`]), out: path.join(dir, 'b.json') });
    expect(fromFile.ok && fromStream.ok).toBe(true);
    const a = await readFile(path.join(dir, 'a.json'), 'utf8');
    expect(await readFile(path.join(dir, 'b.json'), 'utf8')).toBe(a);
    expect(JSON.parse(a).map((p: { id: string }) => p.id)).toEqual(['b', 'a', 'c']);
    expect(logs.join('\n')).toContain('Rows read: 3');
    expect(logs.join('\n')).toContain('Bucket 700–799: 1 puzzles');
    expect(logs.join('\n')).toContain(`Excluded (${REASON_ILLEGAL}): 0`);
  });

  it('fails on a missing input and leaves the previous output unchanged', async () => {
    const out = path.join(dir, 'keep.json');
    await writeFile(out, 'previous');
    const result = await buildPuzzles({ input: path.join(dir, 'missing.csv'), out });
    expect(result.ok).toBe(false);
    expect(await readFile(out, 'utf8')).toBe('previous');
  });

  it('measures the gzip size at level 9', () => {
    expect(gzipSize('x'.repeat(10_000))).toBeLessThan(100);
  });
});
