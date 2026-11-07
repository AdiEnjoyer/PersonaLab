/**
 * Builds `public/exercises/` from a free-exercise-db checkout (R13).
 * Usage: npm run data:exercises -- [--src <checkout dir>] [--out <output dir>]
 * Default source: .data-src/free-exercise-db. Default output: public/exercises.
 */
import path from 'node:path';
import { buildExercises } from './lib/exercises';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : process.argv[i + 1];
  return path.resolve(value ?? fallback);
}

const srcDir = arg('src', '.data-src/free-exercise-db');
const outDir = arg('out', 'public/exercises');

try {
  const result = await buildExercises({ srcDir, outDir, log: (line) => console.log(line) });
  if (!result.ok) {
    console.error(`${result.fatals.length} fatal problem(s); no files were changed.`);
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
