// Feature: personal-lab, Property 6: Settings accept exactly their accepted values
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { db } from '../../db/db';
import { CORE_TABLES } from '../../db/tables';
import { withFreshDb } from '../../../test/helpers/db';
import { geminiKeyOracle, ORACLE_SETTING_KEYS, settingOracle } from '../../../test/oracles/settings';
import { commitSetting } from '../repo';
import { settingsRegistry } from '../schema';
import { getSecret, SECRET_KEYS, setSecret } from '../secrets';

const arbJunk: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom(null, undefined, true, false, '', ' ', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0),
  fc.constant([]),
  fc.constant({}),
  fc.integer(),
  fc.double(),
  fc.string({ maxLength: 6 }),
  fc.array(fc.integer(), { maxLength: 3 }),
);

/** Canonical decimal numbers with up to 2 decimals in [min, max] (given in hundredths), e.g. 1.65 or 3.5. */
const arbHundredths = (min: number, max: number) => fc.integer({ min, max }).map((h) => Number((h / 100).toFixed(2)));

/** Multiples of `step` computed with float multiplication, which may be off the decimal grid (17 × 0.1). */
const arbFloatMultiple = (step: number, min: number, max: number) => fc.integer({ min, max }).map((k) => k * step);

const arbReminder = fc.oneof(
  fc.constantFrom(3, 7, 14, 30, 'off'),
  fc.integer({ min: -5, max: 40 }),
  fc.constantFrom('Off', 'OFF', '7', 'off ', 3.5, 7.000001),
  arbJunk,
);

const arbRestSec = fc.oneof(
  fc.integer({ min: 0, max: 44 }).map((k) => k * 15),
  fc.integer({ min: -20, max: 700 }),
  arbHundredths(2_500, 61_000),
  fc.double({ min: 0, max: 700 }),
  fc.constantFrom('90', 615, 630, 29.999999999999996),
  arbJunk,
);

const arbRestSound = fc.oneof(fc.boolean(), fc.constantFrom(0, 1, 'true', 'false', 'on'), arbJunk);

const arbHours = fc.oneof(
  fc.integer({ min: -4, max: 90 }).map((k) => k * 0.5),
  arbHundredths(-100, 4_100),
  arbFloatMultiple(0.1, 0, 400),
  fc.double({ min: -1, max: 41 }),
  arbJunk,
);

/** `fc.record` variants: exact keys, any keys missing, or an extra key. */
function arbShape<T extends Record<string, unknown>>(fields: { [K in keyof T]: fc.Arbitrary<T[K]> }): fc.Arbitrary<unknown> {
  return fc.oneof(
    { arbitrary: fc.record(fields), weight: 6 },
    { arbitrary: fc.record(fields, { requiredKeys: [] }), weight: 1 },
    { arbitrary: fc.tuple(fc.record(fields), fc.constantFrom('extra', 'Cut', 'hoursX'), arbJunk).map(([r, k, v]) => ({ ...r, [k]: v === undefined ? 0 : v })), weight: 1 },
    { arbitrary: arbJunk, weight: 1 },
  );
}

const arbTrainingOverride = arbShape({ enabled: fc.oneof({ arbitrary: fc.boolean(), weight: 5 }, { arbitrary: arbJunk, weight: 1 }), hours: arbHours });

const arbAdjustment = fc.oneof(
  { arbitrary: fc.integer({ min: -24, max: 24 }).map((k) => k * 50), weight: 5 },
  { arbitrary: fc.integer({ min: -1_200, max: 1_200 }), weight: 2 },
  { arbitrary: fc.constantFrom(-0, 25, 1_050, -1_050, '50', 49.99999999999999), weight: 1 },
  { arbitrary: fc.double({ min: -1_100, max: 1_100 }), weight: 1 },
  { arbitrary: arbJunk, weight: 1 },
);
const arbGoalAdjust = arbShape({ cut: arbAdjustment, maintain: arbAdjustment, bulk: arbAdjustment });

const arbFactor = fc.oneof(
  { arbitrary: fc.constant('default'), weight: 3 },
  { arbitrary: fc.integer({ min: 14, max: 24 }).map((k) => Number((k / 10).toFixed(1))), weight: 4 },
  { arbitrary: arbHundredths(140, 240), weight: 2 },
  { arbitrary: arbFloatMultiple(0.1, 14, 24), weight: 2 },
  { arbitrary: fc.constantFrom('Default', 'DEFAULT', 'goal default', ''), weight: 1 },
  { arbitrary: arbJunk, weight: 1 },
);
const arbProteinFactor = arbShape({ cut: arbFactor, maintain: arbFactor, bulk: arbFactor });

const USERNAME_CHARS = [...'abcxyzABCXYZ0189_-', ' ', '.', 'ä', '@', '\t', 'ש'];
const arbPadding = fc.constantFrom('', '', ' ', '  ', '\t', '\n', '\u00a0', ' \u2003');
const arbUsername = fc.oneof(
  { arbitrary: fc.tuple(arbPadding, fc.string({ unit: fc.constantFrom(...USERNAME_CHARS), minLength: 0, maxLength: 30 }), arbPadding).map(([a, s, b]) => a + s + b), weight: 4 },
  { arbitrary: fc.tuple(arbPadding, fc.stringMatching(/^[A-Za-z0-9_-]{1,27}$/), arbPadding).map(([a, s, b]) => a + s + b), weight: 4 },
  { arbitrary: fc.constantFrom('AdiChessLarper', 'ab', 'abc', 'A'.repeat(25), 'A'.repeat(26)), weight: 1 },
  { arbitrary: arbJunk, weight: 1 },
);

const MODEL_CHARS = [...'abcXYZ019._-', ' ', '/', ':', 'ä'];
const arbGeminiModel = fc.oneof(
  { arbitrary: fc.tuple(arbPadding, fc.string({ unit: fc.constantFrom(...MODEL_CHARS), minLength: 0, maxLength: 85 }), arbPadding).map(([a, s, b]) => a + s + b), weight: 4 },
  { arbitrary: fc.tuple(arbPadding, fc.stringMatching(/^[A-Za-z0-9._-]{1,82}$/), arbPadding).map(([a, s, b]) => a + s + b), weight: 4 },
  { arbitrary: fc.constantFrom('gemini-3.8-flash', 'a'.repeat(80), 'a'.repeat(81), ''), weight: 1 },
  { arbitrary: arbJunk, weight: 1 },
);

const arbProxyUrl = fc.oneof(
  fc.constant(''),
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc.domain().map((d) => `https://${d}/`),
  fc.integer({ min: 2_030, max: 2_040 }).map((n) => `https://a.io/${'x'.repeat(n)}`),
  fc.constantFrom(' https://a.io', 'https://', 'https:// bad', 'HTTPS://a.io', 'http://a.io', 'a.io', 'https://a.io '),
  fc.string({ maxLength: 12 }),
  arbJunk,
);

const arbRatingSource = fc.oneof(fc.constantFrom('rapid', 'manual', 'Rapid', 'MANUAL', 'blitz', ' rapid', ''), arbJunk);

const arbManualRating = fc.oneof(
  fc.integer({ min: 0, max: 3_200 }),
  fc.constantFrom(99, 100, 3_000, 3_001, 1_100.5, '1100', 99.99999999999999),
  fc.double({ min: 0, max: 3_200 }),
  arbJunk,
);

const KEY_CHARS = [...'aAzZ09-_.•é', 'ש', '😀', ' ', '\t'];
const arbGeminiKey = fc.oneof(
  { arbitrary: fc.tuple(arbPadding, fc.string({ unit: fc.constantFrom(...KEY_CHARS.slice(0, -2)), minLength: 0, maxLength: 205 }), arbPadding).map(([a, s, b]) => a + s + b), weight: 4 },
  { arbitrary: fc.string({ unit: fc.constantFrom(...KEY_CHARS), maxLength: 20 }), weight: 2 },
  { arbitrary: fc.integer({ min: 195, max: 205 }).map((n) => 'k'.repeat(n)), weight: 1 },
  { arbitrary: arbJunk, weight: 1 },
);

const CANDIDATES: Record<string, fc.Arbitrary<unknown>> = {
  'core.backupReminderDays': arbReminder,
  'gym.defaultRestSec': arbRestSec,
  'gym.restSound': arbRestSound,
  'nutrition.trainingOverride': arbTrainingOverride,
  'nutrition.goalAdjust': arbGoalAdjust,
  'nutrition.proteinFactor': arbProteinFactor,
  'nutrition.geminiModel': arbGeminiModel,
  'chess.username': arbUsername,
  'chess.proxyUrl': arbProxyUrl,
  'chess.ratingSource': arbRatingSource,
  'chess.manualRating': arbManualRating,
};

const storedSetting = (key: string) => db.table(CORE_TABLES.settings).get(key);

describe('Property 6: Settings accept exactly their accepted values', () => {
  it('covers every registered setting', () => {
    expect(Object.keys(CANDIDATES)).toEqual([...settingsRegistry().keys()]);
    expect(ORACLE_SETTING_KEYS).toEqual([...settingsRegistry().keys()]);
  });

  it.each(Object.keys(CANDIDATES))('%s: commit stores the value iff the schema accepts it', async (key) => {
    const arbCandidate = CANDIDATES[key]!;
    await fc.assert(
      fc.asyncProperty(fc.option(arbCandidate, { nil: undefined, freq: 2 }), arbCandidate, async (initial, candidate) => {
        await withFreshDb(async () => {
          if (initial !== undefined) await commitSetting(key, initial);
          const before = await storedSetting(key);

          const expected = settingOracle(key, candidate);
          const result = await commitSetting(key, candidate);
          const after = await storedSetting(key);

          if (expected.ok) {
            expect(result).toEqual({ ok: true });
            expect(after).toEqual({ key, value: expected.stored });
          } else {
            expect(result).toEqual({ ok: false, error: settingsRegistry().get(key)!.acceptedValues });
            expect(after).toStrictEqual(before);
          }
        });
      }),
      { numRuns: 100 },
    );
  }, 180_000);

  it('nutrition.geminiKey: setSecret stores the key iff it is accepted', async () => {
    const key = SECRET_KEYS.geminiKey;
    await fc.assert(
      fc.asyncProperty(fc.option(arbGeminiKey, { nil: undefined, freq: 2 }), arbGeminiKey, async (initial, candidate) => {
        await withFreshDb(async () => {
          if (initial !== undefined) await setSecret(key, initial);
          const before = await getSecret(key);

          const expected = geminiKeyOracle(candidate);
          const result = await setSecret(key, candidate);
          const after = await getSecret(key);

          if (expected.ok) {
            expect(result).toEqual({ ok: true });
            expect(after).toBe(expected.stored);
          } else {
            expect(result.ok).toBe(false);
            expect(after).toBe(before);
          }
        });
      }),
      { numRuns: 100 },
    );
  }, 180_000);
});
