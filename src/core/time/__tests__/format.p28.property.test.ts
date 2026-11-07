import { describe, it } from 'vitest';
import fc from 'fast-check';
import { formatClock } from '../format';

const M_SS = /^([1-5]?\d):([0-5]\d)$/;
const H_MM_SS = /^([1-9]\d*):([0-5]\d):([0-5]\d)$/;

/** Parse clock text back to seconds; `null` when it matches neither shape. */
function parseClock(text: string): { shape: 'M:SS' | 'H:MM:SS'; seconds: number } | null {
  const short = M_SS.exec(text);
  if (short) return { shape: 'M:SS', seconds: Number(short[1]) * 60 + Number(short[2]) };
  const long = H_MM_SS.exec(text);
  if (long) {
    return { shape: 'H:MM:SS', seconds: Number(long[1]) * 3600 + Number(long[2]) * 60 + Number(long[3]) };
  }
  return null;
}

describe('formatClock', () => {
  it('uses M:SS below an hour, H:MM:SS from an hour, and parses back to the input', () => {
    // Feature: personal-lab, Property 28: Clock and elapsed formatting
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 0, max: 360_000 }),
          fc.constantFrom(0, 59, 60, 3599, 3600, 3601, 35_999, 36_000, 360_000),
        ),
        (s) => {
          const parsed = parseClock(formatClock(s));
          return parsed !== null && parsed.shape === (s < 3600 ? 'M:SS' : 'H:MM:SS') && parsed.seconds === s;
        },
      ),
      { numRuns: 1000 },
    );
  });
});
