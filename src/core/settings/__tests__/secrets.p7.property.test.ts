// Feature: personal-lab, Property 7: Key mask shows only the last four characters
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { geminiKeySchema, maskKey } from '../secrets';

/** Accepted Gemini_Keys: 1 to 200 characters (any code points, including astral ones) with no whitespace. */
const arbAcceptedKey = fc.oneof(
  fc.string({ unit: 'binary', minLength: 1, maxLength: 200 }),
  fc.string({ unit: fc.constantFrom(...'AIzaSyB0123456789-_'), minLength: 1, maxLength: 200 }),
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }),
)
  .filter((k) => !/\s/.test(k) && k.length <= 200);

describe('Property 7: Key mask shows only the last four characters', () => {
  it('keeps the length, shows the last four characters and masks every other position', () => {
    fc.assert(
      fc.property(arbAcceptedKey, (k) => {
        expect(geminiKeySchema.safeParse(k)).toEqual({ success: true, data: k });
        const masked = maskKey(k);
        const hidden = Math.max(0, k.length - 4);
        expect(masked.length).toBe(k.length);
        expect(masked.endsWith(k.slice(-4))).toBe(true);
        expect(masked.slice(hidden)).toBe(k.slice(hidden));
        for (let i = 0; i < hidden; i += 1) expect(masked[i]).toBe('•');
      }),
      { numRuns: 1000 },
    );
  });
});
