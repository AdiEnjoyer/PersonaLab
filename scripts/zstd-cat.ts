/**
 * Decompresses a .zst file to stdout using Node's built-in zstd, skipping leading skippable frames
 * (the Lichess dumps start with one, which Node's decoder rejects).
 * Usage: tsx scripts/zstd-cat.ts <file.zst> | npm run data:puzzles -- --in -
 */
import { createReadStream, openSync, readSync, closeSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createZstdDecompress } from 'node:zlib';

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/zstd-cat.ts <file.zst>');
  process.exit(1);
}

/** Byte offset of the first real zstd frame (skips frames with magic 0x184D2A5x). */
function firstFrameOffset(path: string): number {
  const fd = openSync(path, 'r');
  try {
    let offset = 0;
    const header = Buffer.alloc(8);
    for (;;) {
      if (readSync(fd, header, 0, 8, offset) < 8) return offset;
      const magic = header.readUInt32LE(0);
      if ((magic & 0xfffffff0) >>> 0 !== 0x184d2a50) return offset;
      offset += 8 + header.readUInt32LE(4);
    }
  } finally {
    closeSync(fd);
  }
}

try {
  await pipeline(createReadStream(file, { start: firstFrameOffset(file) }), createZstdDecompress(), process.stdout);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
