import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db/db';
import { DbWriteError } from '../../db/errors';
import { CORE_TABLES } from '../../db/tables';
import { installWriteFailures, withFreshDb } from '../../../test/helpers/db';
import { getProfile, saveProfile, useProfile } from '../repo';
import {
  EMPTY_PROFILE_TEXTS,
  PROFILE_FIELD_RULES,
  ProfileSchema,
  profileToTexts,
  validateProfile,
  type ProfileTexts,
} from '../schema';

const failures = installWriteFailures(db);

const VALID: ProfileTexts = {
  age: '30',
  sex: 'male',
  heightCm: '180',
  weightKg: '80.5',
  weeklyTrainingHours: '4.5',
  goal: 'maintain',
};

beforeEach(async () => {
  failures.clear();
  await withFreshDb(async () => undefined);
});

describe('validateProfile', () => {
  it('accepts a valid form and returns the numbers', () => {
    expect(validateProfile(VALID)).toEqual({
      ok: true,
      values: { age: 30, sex: 'male', heightCm: 180, weightKg: 80.5, weeklyTrainingHours: 4.5, goal: 'maintain' },
    });
  });

  it('accepts both bounds of every range', () => {
    const low = { ...VALID, age: '13', heightCm: '100', weightKg: '30.0', weeklyTrainingHours: '0' };
    const high = { ...VALID, age: '100', heightCm: '250', weightKg: '300.0', weeklyTrainingHours: '40' };
    expect(validateProfile(low).ok).toBe(true);
    expect(validateProfile(high).ok).toBe(true);
  });

  it('rejects 70.25 kg, 175.5 cm and 3.2 h with the accepted range and step', () => {
    const result = validateProfile({ ...VALID, weightKg: '70.25', heightCm: '175.5', weeklyTrainingHours: '3.2' });
    expect(result).toEqual({
      ok: false,
      errors: {
        heightCm: PROFILE_FIELD_RULES.heightCm,
        weightKg: PROFILE_FIELD_RULES.weightKg,
        weeklyTrainingHours: PROFILE_FIELD_RULES.weeklyTrainingHours,
      },
    });
    expect(PROFILE_FIELD_RULES.weightKg).toBe('Accepted: 30.0 to 300.0 kg, in steps of 0.1 kg.');
  });

  it('rejects empty, non-numeric and out-of-range fields and unpicked options', () => {
    const result = validateProfile({ age: '', sex: '', heightCm: 'abc', weightKg: '300.1', weeklyTrainingHours: '-1', goal: 'gain' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['age', 'goal', 'heightCm', 'sex', 'weeklyTrainingHours', 'weightKg']);
    expect(validateProfile({ ...VALID, age: '12' }).ok).toBe(false);
    expect(validateProfile({ ...VALID, age: '101' }).ok).toBe(false);
    expect(validateProfile({ ...VALID, age: '30.5' }).ok).toBe(false);
    expect(validateProfile({ ...VALID, weightKg: '29.9' }).ok).toBe(false);
    expect(validateProfile({ ...VALID, weeklyTrainingHours: '40.5' }).ok).toBe(false);
    expect(validateProfile({ ...VALID, weightKg: '1e2' }).ok).toBe(false);
  });

  it('accepts a decimal comma, surrounding spaces and trailing zeros', () => {
    expect(validateProfile({ ...VALID, weightKg: ' 70,2 ', weeklyTrainingHours: '3.50' })).toMatchObject({
      ok: true,
      values: { weightKg: 70.2, weeklyTrainingHours: 3.5 },
    });
  });

  it('round-trips a stored Profile through the form texts', () => {
    const values = (validateProfile(VALID) as { ok: true; values: object }).values;
    expect(validateProfile(profileToTexts({ id: 'profile', ...values, updatedAt: 1 } as never))).toEqual({ ok: true, values });
    expect(profileToTexts(null)).toEqual(EMPTY_PROFILE_TEXTS);
  });
});

describe('ProfileSchema', () => {
  it('validates stored records', () => {
    const record = { id: 'profile', age: 30, sex: 'female', heightCm: 165, weightKg: 60.1, weeklyTrainingHours: 2.5, goal: 'cut', updatedAt: 5 };
    expect(ProfileSchema.safeParse(record).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...record, weightKg: 70.25 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...record, weeklyTrainingHours: 3.2 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...record, heightCm: 175.5 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...record, extra: 1 }).success).toBe(false);
  });
});

describe('profile repository', () => {
  it('has no Profile before the first save', async () => {
    await expect(getProfile()).resolves.toBeNull();
  });

  it('stores all six fields on a valid save', async () => {
    const result = await saveProfile(VALID, 1234);
    const expected = { id: 'profile', age: 30, sex: 'male', heightCm: 180, weightKg: 80.5, weeklyTrainingHours: 4.5, goal: 'maintain', updatedAt: 1234 };
    expect(result).toEqual({ ok: true, profile: expected });
    await expect(getProfile()).resolves.toEqual(expected);
  });

  it('writes nothing for an invalid form', async () => {
    const first = await saveProfile({ ...EMPTY_PROFILE_TEXTS, age: '30' }, 1);
    expect(first).toMatchObject({ ok: false, reason: 'invalid' });
    await expect(db.table(CORE_TABLES.profile).count()).resolves.toBe(0);

    await saveProfile(VALID, 2);
    const second = await saveProfile({ ...VALID, age: '40', weightKg: '70.25' }, 3);
    expect(second).toEqual({ ok: false, reason: 'invalid', errors: { weightKg: PROFILE_FIELD_RULES.weightKg } });
    await expect(getProfile()).resolves.toMatchObject({ age: 30, weightKg: 80.5, updatedAt: 2 });
  });

  it('keeps the stored Profile when the write fails', async () => {
    await saveProfile(VALID, 1);
    failures.failNext(CORE_TABLES.profile, () => new DOMException('full', 'QuotaExceededError'));
    const result = await saveProfile({ ...VALID, age: '45' }, 2);
    expect(result).toMatchObject({ ok: false, reason: 'write-failed' });
    if (!result.ok && result.reason === 'write-failed') {
      expect(result.error).toBeInstanceOf(DbWriteError);
      expect(result.error.quota).toBe(true);
    }
    await expect(getProfile()).resolves.toMatchObject({ age: 30, updatedAt: 1 });
  });

  it('useProfile reports null, then the saved Profile', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current).toBeNull());
    await act(async () => {
      await saveProfile(VALID, 9);
    });
    await waitFor(() => expect(result.current).toMatchObject({ age: 30, updatedAt: 9 }));
  });
});
