import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { DbWriteError } from '../../db/errors';
import { CORE_TABLES } from '../../db/tables';
import { installWriteFailures, withFreshDb } from '../../../test/helpers/db';
import { deleteSecret, geminiKeySchema, getSecret, maskKey, SECRET_KEYS, setSecret } from '../secrets';

const failures = installWriteFailures(db);
const KEY = SECRET_KEYS.geminiKey;

beforeEach(async () => {
  failures.clear();
  await withFreshDb(async () => undefined);
});

describe('maskKey', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('abcd1234')).toBe('••••1234');
    expect(maskKey('abcd')).toBe('abcd');
    expect(maskKey('ab')).toBe('ab');
    expect(maskKey('')).toBe('');
  });
});

describe('Gemini key schema', () => {
  it('accepts empty or 1 to 200 characters without whitespace after trimming', () => {
    for (const ok of ['', '   ', 'a', 'AIza-key_123', 'k'.repeat(200), '  key  ']) expect(geminiKeySchema.safeParse(ok).success, ok).toBe(true);
    for (const bad of ['two words', 'tab\there', 'line\nbreak', 'k'.repeat(201), 5, null]) {
      expect(geminiKeySchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe('secrets', () => {
  it('reads undefined while no key is stored', async () => {
    await expect(getSecret(KEY)).resolves.toBeUndefined();
  });

  it('stores the trimmed key in core_secrets', async () => {
    await expect(setSecret(KEY, '  AIza123  ')).resolves.toEqual({ ok: true });
    await expect(getSecret(KEY)).resolves.toBe('AIza123');
    await expect(db.table(CORE_TABLES.secrets).toArray()).resolves.toEqual([{ key: KEY, value: 'AIza123' }]);
  });

  it('removes the key when an empty value is set', async () => {
    await setSecret(KEY, 'AIza123');
    await expect(setSecret(KEY, '   ')).resolves.toEqual({ ok: true });
    await expect(getSecret(KEY)).resolves.toBeUndefined();
  });

  it('keeps the stored key and returns the accepted values for an invalid key', async () => {
    await setSecret(KEY, 'AIza123');
    await expect(setSecret(KEY, 'has space')).resolves.toEqual({
      ok: false,
      error: 'Accepted values: empty, or 1 to 200 characters with no spaces.',
    });
    await expect(getSecret(KEY)).resolves.toBe('AIza123');
  });

  it('keeps the stored key when the write fails', async () => {
    await setSecret(KEY, 'AIza123');
    failures.failNext(CORE_TABLES.secrets, () => new Error('disk'));
    await expect(setSecret(KEY, 'other')).rejects.toBeInstanceOf(DbWriteError);
    await expect(getSecret(KEY)).resolves.toBe('AIza123');
  });

  it('deletes the key', async () => {
    await setSecret(KEY, 'AIza123');
    await deleteSecret(KEY);
    await expect(getSecret(KEY)).resolves.toBeUndefined();
  });
});
