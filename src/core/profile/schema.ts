import { z } from 'zod';
import { isMultipleOfStep, parseDecimal } from '../math/decimal';

export const SEXES = ['male', 'female'] as const;
export const GOALS = ['cut', 'maintain', 'bulk'] as const;
export type Sex = (typeof SEXES)[number];
export type Goal = (typeof GOALS)[number];

/** The id of the single `core_profile` record. */
export const PROFILE_ID = 'profile';

/** The six Profile fields, in form order (R4.1). */
export const PROFILE_FIELDS = ['age', 'sex', 'heightCm', 'weightKg', 'weeklyTrainingHours', 'goal'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export type NumericProfileField = 'age' | 'heightCm' | 'weightKg' | 'weeklyTrainingHours';

export interface NumericRule {
  /** Inclusive bounds (R4.2). */
  min: number;
  max: number;
  step: number;
  unit: string;
}

/** Accepted ranges and steps of the typed Profile fields (R4.2). */
export const PROFILE_NUMERIC_RULES: Readonly<Record<NumericProfileField, NumericRule>> = {
  age: { min: 13, max: 100, step: 1, unit: 'years' },
  heightCm: { min: 100, max: 250, step: 1, unit: 'cm' },
  weightKg: { min: 30, max: 300, step: 0.1, unit: 'kg' },
  weeklyTrainingHours: { min: 0, max: 40, step: 0.5, unit: 'h' },
};

/** The accepted range and step shown next to each invalid field (R4.3). */
export const PROFILE_FIELD_RULES: Readonly<Record<ProfileField, string>> = {
  age: 'Accepted: 13 to 100 years, in whole years.',
  sex: 'Choose male or female.',
  heightCm: 'Accepted: 100 to 250 cm, in whole centimetres.',
  weightKg: 'Accepted: 30.0 to 300.0 kg, in steps of 0.1 kg.',
  weeklyTrainingHours: 'Accepted: 0 to 40 hours, in steps of 0.5 hours.',
  goal: 'Choose cut, maintain or bulk.',
};

/** True when the shortest decimal form of `value` is an exact multiple of `step` (non-negative values). */
function onDecimalStep(value: number, step: number): boolean {
  return isMultipleOfStep(String(value), step);
}

/** A stored Profile record (`core_profile`, also `core.profile` in a Backup_File). */
export const ProfileSchema = z.strictObject({
  id: z.literal(PROFILE_ID),
  age: z.number().int().min(13).max(100),
  sex: z.enum(SEXES),
  heightCm: z.number().int().min(100).max(250),
  weightKg: z.number().min(30).max(300).refine((v) => onDecimalStep(v, 0.1), { message: 'Must have at most 1 decimal' }),
  weeklyTrainingHours: z
    .number()
    .min(0)
    .max(40)
    .refine((v) => onDecimalStep(v, 0.5), { message: 'Must be a multiple of 0.5' }),
  goal: z.enum(GOALS),
  updatedAt: z.number().int().min(0),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** The six Profile values without the record bookkeeping. */
export type ProfileValues = Omit<Profile, 'id' | 'updatedAt'>;

/** The Profile form as entered: typed text for the numeric fields, the picked option (or '') for sex and goal. */
export type ProfileTexts = Record<ProfileField, string>;

export const EMPTY_PROFILE_TEXTS: Readonly<ProfileTexts> = {
  age: '',
  sex: '',
  heightCm: '',
  weightKg: '',
  weeklyTrainingHours: '',
  goal: '',
};

export type ProfileValidation =
  | { ok: true; values: ProfileValues }
  /** Every invalid field with its accepted range and step (R4.3). */
  | { ok: false; errors: Partial<Record<ProfileField, string>> };

/**
 * The value of entered `text` when it is a non-negative decimal (`.` or `,` separator), an exact multiple of
 * `rule.step` and inside `[rule.min, rule.max]`; otherwise `null`. The step check works on the entered
 * digits, so 70.25 kg, 175.5 cm and 3.2 h are rejected exactly while 70.20 kg equals 70.2 kg.
 */
function checkNumeric(text: string, rule: NumericRule): number | null {
  const value = parseDecimal(text, { maxDecimals: Number.POSITIVE_INFINITY, allowComma: true });
  if (value === null) return null;
  if (!isMultipleOfStep(text, rule.step)) return null;
  if (value < rule.min || value > rule.max) return null;
  return value;
}

function isOneOf<T extends string>(options: readonly T[], value: string): value is T {
  return (options as readonly string[]).includes(value);
}

/**
 * Checks the entered Profile form against R4.2. Accepts only when all six fields are valid; otherwise
 * reports every invalid field (empty, not a number, out of range or off-step) with its accepted range and
 * step (R4.3).
 */
export function validateProfile(texts: ProfileTexts): ProfileValidation {
  const errors: Partial<Record<ProfileField, string>> = {};
  const numeric = (field: NumericProfileField): number => {
    const value = checkNumeric(texts[field], PROFILE_NUMERIC_RULES[field]);
    if (value === null) {
      errors[field] = PROFILE_FIELD_RULES[field];
      return Number.NaN;
    }
    return value;
  };

  const age = numeric('age');
  const heightCm = numeric('heightCm');
  const weightKg = numeric('weightKg');
  const weeklyTrainingHours = numeric('weeklyTrainingHours');
  const sex = isOneOf(SEXES, texts.sex) ? texts.sex : null;
  const goal = isOneOf(GOALS, texts.goal) ? texts.goal : null;
  if (sex === null) errors.sex = PROFILE_FIELD_RULES.sex;
  if (goal === null) errors.goal = PROFILE_FIELD_RULES.goal;

  if (sex === null || goal === null || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { age, sex, heightCm, weightKg, weeklyTrainingHours, goal } };
}

/** The form texts for a stored Profile, or an empty form when there is none (R4.4, R4.6). */
export function profileToTexts(profile: Profile | null): ProfileTexts {
  if (profile === null) return { ...EMPTY_PROFILE_TEXTS };
  return {
    age: String(profile.age),
    sex: profile.sex,
    heightCm: String(profile.heightCm),
    weightKg: String(profile.weightKg),
    weeklyTrainingHours: String(profile.weeklyTrainingHours),
    goal: profile.goal,
  };
}
