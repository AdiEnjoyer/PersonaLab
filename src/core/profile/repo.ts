import type Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { toDbWriteError, type DbWriteError } from '../db/errors';
import { stripUndefined } from '../db/strip';
import { CORE_TABLES } from '../db/tables';
import { write } from '../db/write';
import { PROFILE_ID, ProfileSchema, validateProfile, type Profile, type ProfileField, type ProfileTexts } from './schema';

function profileTable(database: Dexie) {
  return database.table<Profile, string>(CORE_TABLES.profile);
}

/**
 * The stored Profile, or `null` when none has been saved (or the stored record is not a valid Profile).
 * A read failure rejects. Safe inside `liveQuery`.
 */
export async function getProfile(database: Dexie = db): Promise<Profile | null> {
  const record = await profileTable(database).get(PROFILE_ID);
  if (record === undefined) return null;
  const parsed = ProfileSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export type SaveProfileResult =
  | { ok: true; profile: Profile }
  /** Nothing was written; the form keeps the entered values (R4.3). */
  | { ok: false; reason: 'invalid'; errors: Partial<Record<ProfileField, string>> }
  /** The write failed; the stored Profile is unchanged (R4.7). */
  | { ok: false; reason: 'write-failed'; error: DbWriteError };

/**
 * Validates the entered form and, only when all six fields are valid, stores all six in one write (R4.6).
 * An invalid form or a failed write leaves the stored Profile unchanged (R4.3, R4.7, R4.8).
 */
export async function saveProfile(texts: ProfileTexts, now: number = Date.now(), database: Dexie = db): Promise<SaveProfileResult> {
  const checked = validateProfile(texts);
  if (!checked.ok) return { ok: false, reason: 'invalid', errors: checked.errors };
  const profile: Profile = stripUndefined({ id: PROFILE_ID, ...checked.values, updatedAt: now });
  try {
    await write([CORE_TABLES.profile], () => profileTable(database).put(profile), database);
  } catch (error) {
    return { ok: false, reason: 'write-failed', error: toDbWriteError(error) };
  }
  return { ok: true, profile };
}

/**
 * The live stored Profile: `undefined` while the first read is pending, `null` while no Profile exists
 * (the first-run screen, R4.4), otherwise the Profile. Updates in every window after a save (R4.5).
 */
export function useProfile(): Profile | null | undefined {
  return useLiveQuery(() => getProfile(), []);
}
