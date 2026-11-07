import fc from 'fast-check';
import { addDays, daysBetween, type LocalDate } from '../../core/time/localDate';

const charRange = (from: number, to: number): fc.Arbitrary<string> =>
  fc.integer({ min: from, max: to }).map((c) => String.fromCodePoint(c));

/** One text unit from the mixed alphabet of the shared generators table. */
const textUnit: fc.Arbitrary<string> = fc.oneof(
  // Printable ASCII
  charRange(0x20, 0x7e),
  // Latin letters followed by a combining diacritic (e + U+0301 …)
  fc
    .tuple(fc.constantFrom('a', 'e', 'i', 'o', 'u', 'n', 'c', 'A', 'E', 'O'), charRange(0x0300, 0x036f))
    .map(([letter, mark]) => letter + mark),
  // Precomposed accented letters
  fc.constantFrom('é', 'è', 'ê', 'ë', 'á', 'à', 'ä', 'ö', 'ü', 'ñ', 'ç', 'É', 'Ö', 'Ü', 'Å', 'ø'),
  // Hebrew letters and niqqud
  charRange(0x05d0, 0x05ea),
  charRange(0x05b0, 0x05bc),
  // Emoji, including ZWJ sequences and a skin-tone modifier
  fc.constantFrom('😀', '💪', '🍎', '♟️', '👍🏽', '👨‍👩‍👧', '🏳️‍🌈', '🧑‍💻'),
  // Spaces and punctuation used in names
  fc.constantFrom(' ', '\u00a0', '-', '/', '(', ')'),
);

/** Strings of `min`–`max` units over the mixed alphabet. */
export const arbText = (min: number, max: number): fc.Arbitrary<string> =>
  fc.string({ unit: textUnit, minLength: min, maxLength: max });

const FIRST_DATE: LocalDate = '2020-01-01';
const LAST_DATE: LocalDate = '2035-12-31';

/** A Local_Date from 2020-01-01 to 2035-12-31. */
export const arbLocalDate: fc.Arbitrary<LocalDate> = fc
  .integer({ min: 0, max: daysBetween(FIRST_DATE, LAST_DATE) })
  .map((offset) => addDays(FIRST_DATE, offset));

/** An epoch timestamp in ms from local 2020-01-01 00:00 to the end of 2035. */
export const arbEpoch: fc.Arbitrary<number> = fc.integer({
  min: new Date(2020, 0, 1).getTime(),
  max: new Date(2036, 0, 1).getTime() - 1,
});

/** Arbitrary image file bytes (0–4096 bytes). */
export const arbImageBytes: fc.Arbitrary<Uint8Array> = fc.uint8Array({ minLength: 0, maxLength: 4096 });
