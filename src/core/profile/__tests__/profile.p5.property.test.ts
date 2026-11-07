// Feature: personal-lab, Property 5: Profile validation accepts exactly valid profiles
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { db } from '../../db/db';
import { CORE_TABLES } from '../../db/tables';
import { withFreshDb } from '../../../test/helpers/db';
import { profileOracle } from '../../../test/oracles/profile';
import { saveProfile } from '../repo';
import { PROFILE_FIELD_RULES, PROFILE_FIELDS, validateProfile, type ProfileField, type ProfileTexts } from '../schema';

type NumericField = 'age' | 'heightCm' | 'weightKg' | 'weeklyTrainingHours';

/** Ranges in tenths: [min, max, step]. */
const TENTHS: Record<NumericField, [number, number, number]> = {
  age: [130, 1000, 10],
  heightCm: [1000, 2500, 10],
  weightKg: [300, 3000, 1],
  weeklyTrainingHours: [0, 400, 5],
};

const arbPad = fc.constantFrom('', ' ', '  ', '\t');
const arbSep = fc.constantFrom('.', ',');

/** Text for a value in tenths, written in one of its equivalent decimal forms. */
function arbTenthsText(tenths: number): fc.Arbitrary<string> {
  const whole = Math.floor(tenths / 10);
  const digit = tenths % 10;
  return fc
    .record({
      lead: fc.constantFrom('', '', '', '0', '00'),
      frac: digit === 0 ? fc.constantFrom('', '', '0', '00') : fc.constantFrom(`${digit}`, `${digit}0`),
      sep: arbSep,
      before: arbPad,
      after: arbPad,
    })
    .map(({ lead, frac, sep, before, after }) => `${before}${lead}${whole}${frac === '' ? '' : sep + frac}${after}`);
}

/** A valid entry: an on-step value inside the range. */
function arbValid(field: NumericField): fc.Arbitrary<string> {
  const [min, max, step] = TENTHS[field];
  return fc.integer({ min: min / step, max: max / step }).chain((k) => arbTenthsText(k * step));
}

/** An on-step value just outside the range (non-negative only; negatives are covered by the junk generator). */
function arbOutOfRange(field: NumericField): fc.Arbitrary<string> {
  const [min, max, step] = TENTHS[field];
  const below = Math.max(0, min - 200 * step);
  const arbs: fc.Arbitrary<number>[] = [fc.integer({ min: (max + step) / step, max: (max + 200 * step) / step }).map((k) => k * step)];
  if (min > 0) arbs.push(fc.integer({ min: below / step, max: (min - step) / step }).map((k) => k * step));
  return fc.oneof(...arbs).chain(arbTenthsText);
}

/** A value inside the range with extra precision, mostly off-step (e.g. 70.25 kg, 175.5 cm, 3.2 h). */
function arbOffStep(field: NumericField): fc.Arbitrary<string> {
  const [min, max] = TENTHS[field];
  return fc
    .record({
      whole: fc.integer({ min: Math.floor(min / 10), max: Math.floor(max / 10) }),
      frac: fc.stringMatching(/^[0-9]{1,4}$/),
      sep: arbSep,
    })
    .map(({ whole, frac, sep }) => `${whole}${sep}${frac}`);
}

const arbJunk: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('', ' ', 'abc', '1e2', '-5', '+5', '5.', '.5', '1,2,3', '1.2.3', 'NaN', 'Infinity', '٣٠', '3 0', '0x1F', '-0'),
  fc.string({ maxLength: 8 }),
  fc.integer({ min: -500, max: 500 }).map(String),
  fc.double({ noNaN: false }).map(String),
);

function arbNumericCandidate(field: NumericField): fc.Arbitrary<string> {
  return fc.oneof(
    { arbitrary: arbValid(field), weight: 3 },
    { arbitrary: arbOutOfRange(field), weight: 2 },
    { arbitrary: arbOffStep(field), weight: 2 },
    { arbitrary: arbJunk, weight: 2 },
  );
}

function arbOptionCandidate(options: readonly string[]): fc.Arbitrary<string> {
  return fc.oneof(
    { arbitrary: fc.constantFrom(...options), weight: 3 },
    { arbitrary: fc.constantFrom('', 'Male', 'FEMALE', ' male', 'other', 'maintain ', 'gain', 'male', 'cut'), weight: 2 },
    { arbitrary: fc.string({ maxLength: 8 }), weight: 1 },
  );
}

const SEX_OPTIONS = ['male', 'female'];
const GOAL_OPTIONS = ['cut', 'maintain', 'bulk'];

const arbValidForm: fc.Arbitrary<ProfileTexts> = fc.record({
  age: arbValid('age'),
  sex: fc.constantFrom(...SEX_OPTIONS),
  heightCm: arbValid('heightCm'),
  weightKg: arbValid('weightKg'),
  weeklyTrainingHours: arbValid('weeklyTrainingHours'),
  goal: fc.constantFrom(...GOAL_OPTIONS),
});

const arbCandidateForm: fc.Arbitrary<ProfileTexts> = fc.record({
  age: arbNumericCandidate('age'),
  sex: arbOptionCandidate(SEX_OPTIONS),
  heightCm: arbNumericCandidate('heightCm'),
  weightKg: arbNumericCandidate('weightKg'),
  weeklyTrainingHours: arbNumericCandidate('weeklyTrainingHours'),
  goal: arbOptionCandidate(GOAL_OPTIONS),
});

/** A valid form with a subset of its fields replaced by candidates, mixed with fully valid forms. */
const arbForm: fc.Arbitrary<ProfileTexts> = fc.oneof(
  { arbitrary: arbValidForm, weight: 1 },
  {
    arbitrary: fc.tuple(arbValidForm, arbCandidateForm, fc.subarray([...PROFILE_FIELDS])).map(([valid, candidate, replaced]) => {
      const form = { ...valid };
      for (const field of replaced) form[field] = candidate[field];
      return form;
    }),
    weight: 3,
  },
);

describe('Property 5: Profile validation accepts exactly valid profiles', () => {
  it('validateProfile accepts iff every field satisfies R4.2 and reports exactly the invalid fields', () => {
    fc.assert(
      fc.property(arbForm, (form) => {
        const expected = profileOracle(form);
        const actual = validateProfile(form);
        if (expected.ok) {
          expect(actual).toEqual({ ok: true, values: expected.values });
        } else {
          expect(actual.ok).toBe(false);
          if (actual.ok) return;
          expect(Object.keys(actual.errors).sort()).toEqual(expected.invalid);
          for (const [field, message] of Object.entries(actual.errors)) {
            expect(message).toBe(PROFILE_FIELD_RULES[field as ProfileField]);
          }
        }
      }),
      { numRuns: 1000 },
    );
  }, 60_000);

  it('a rejected save leaves the stored Profile unchanged and an accepted one stores all six fields', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(arbValidForm, { nil: null }), arbForm, async (initial, form) => {
        await withFreshDb(async () => {
          if (initial !== null) expect((await saveProfile(initial, 1)).ok).toBe(true);
          const before = await db.table(CORE_TABLES.profile).toArray();

          const expected = profileOracle(form);
          const result = await saveProfile(form, 2);
          const after = await db.table(CORE_TABLES.profile).toArray();

          if (expected.ok) {
            expect(result.ok).toBe(true);
            expect(after).toEqual([{ id: 'profile', ...expected.values, updatedAt: 2 }]);
          } else {
            expect(result).toMatchObject({ ok: false, reason: 'invalid' });
            expect(after).toStrictEqual(before);
          }
        });
      }),
      { numRuns: 100 },
    );
  }, 180_000);
});
