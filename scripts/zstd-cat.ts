/**
 * Decompresses a multi-frame .zst file to stdout using Node's built-in zstd.
 * The Lichess dumps contain several frames and skippable frames, which a single Node zstd stream rejects
 * ("Unknown frame descriptor"), so each frame is decoded on its own.
 * Usage: tsx scripts/zstd-cat.ts <file.zst> | npm run data:puzzles -- --in -
 * The whole file is read into memory (about 300 MB for the puzzle dump).
 */
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { zstdDecompressSync } from 'node:zlib';

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/zstd-cat.ts <file.zst>');
  process.exit(1);
}

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const SKIPPABLE_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;

function isSkippable(data: Buffer, offset: number): boolean {
  return data.length - offset >= 8 && ((data.readUInt32LE(offset) & SKIPPABLE_MASK) >>> 0) === SKIPPABLE_MAGIC;
}

/** Decodes the frame that starts at `start`: the shortest span up to the next frame magic that decodes cleanly. */
function decodeFrame(data: Buffer, start: number): { output: Buffer; end: number } {
  let end = data.indexOf(ZSTD_MAGIC, start + 4);
  for (;;) {
    const stop = end === -1 ? data.length : end;
    try {
      return { output: zstdDecompressSync(data.subarray(start, stop)), end: stop };
    } catch (error) {
      if (end === -1) throw error;
      end = data.indexOf(ZSTD_MAGIC, end + 4);
    }
  }
}

try {
  const data = readFileSync(file);
  let offset = 0;
  while (offset < data.length) {
    if (isSkippable(data, offset)) {
      offset += 8 + data.readUInt32LE(offset + 4);
      continue;
    }
    const { output, end } = decodeFrame(data, offset);
    if (!process.stdout.write(output)) await once(process.stdout, 'drain');
    offset = end;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
