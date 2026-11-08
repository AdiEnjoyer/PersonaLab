/**
 * Builds `public/data/puzzles.json` from the Lichess puzzle CSV (R47).
 * Usage: npm run data:puzzles -- --in lichess_db_puzzle.csv [--out public/data/puzzles.json]
 *                                [--min-popularity 80] [--min-plays 500]
 * Use `--in -` to read the decompressed CSV from stdin, e.g. `zstd -dc lichess_db_puzzle.csv.zst | npm run data:puzzles -- --in -`.
 */
import path from 'node:path';
import { buildPuzzles, DEFAULT_PARAMS } from './lib/puzzles';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function numberArg(name: string, fallback: number): number {
  const text = arg(name);
  if (text === undefined) return fallback;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${name} must be a non-negative number.`);
    process.exit(1);
  }
  return n;
}

const input = arg('in');
if (input === undefined) {
  console.error('Missing --in <lichess_db_puzzle.csv | ->');
  process.exit(1);
}
const out = path.resolve(arg('out') ?? 'public/data/puzzles.json');

const result = await buildPuzzles({
  input: input === '-' ? process.stdin : path.resolve(input),
  out,
  params: {
    ...DEFAULT_PARAMS,
    minPopularity: numberArg('min-popularity', DEFAULT_PARAMS.minPopularity),
    minPlays: numberArg('min-plays', DEFAULT_PARAMS.minPlays),
  },
  log: (line) => console.log(line),
});
if (!result.ok) {
  console.error(result.reason);
  process.exit(1);
}
