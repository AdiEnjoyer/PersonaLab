import type Dexie from 'dexie';
import { z, type ZodType } from 'zod';
import { db } from '../db/db';
import { CORE_TABLES } from '../db/tables';
import { write } from '../db/write';
import type { SettingResult } from './schema';

/**
 * Keys of `core_secrets`. Secrets are never exported to a Backup_File (R6.3) and their changes do not count
 * as data changes for the backup reminder (R9.2).
 */
export const SECRET_KEYS = {
  geminiKey: 'nutrition.geminiKey',
} as const;
export type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

/** One `core_secrets` record. */
export interface SecretRecord {
  key: SecretKey;
  value: string;
}

/**
 * Gemini_Key: after leading and trailing whitespace is removed, empty or 1 to 200 characters with no
 * whitespace (R5.2). The parsed value is the trimmed text; empty means "not set".
 */
export const geminiKeySchema = z
  .string()
  .trim()
  .max(200)
  .refine((s) => !/\s/.test(s))
  .describe('Accepted values: empty, or 1 to 200 characters with no spaces.');

const SECRET_SCHEMAS: Record<SecretKey, ZodType<string>> = {
  [SECRET_KEYS.geminiKey]: geminiKeySchema,
};

function secretsTable(database: Dexie) {
  return database.table<SecretRecord, string>(CORE_TABLES.secrets);
}

/** The stored secret, or `undefined` when it is not set. */
export async function getSecret(key: SecretKey, database: Dexie = db): Promise<string | undefined> {
  const record = await secretsTable(database).get(key);
  return record?.value;
}

/**
 * Validates `value` with the secret's schema and stores the trimmed text; an empty result deletes the secret.
 * A rejected value writes nothing and returns the accepted-values text (R5.6). A failed write rejects with
 * `DbWriteError` and leaves the stored secret unchanged.
 */
export async function setSecret(key: SecretKey, value: unknown, database: Dexie = db): Promise<SettingResult> {
  const schema = SECRET_SCHEMAS[key];
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, error: schema.description ?? 'This value is not accepted.' };
  const text = parsed.data;
  await write(
    [CORE_TABLES.secrets],
    async () => {
      if (text === '') await secretsTable(database).delete(key);
      else await secretsTable(database).put({ key, value: text });
    },
    database,
  );
  return { ok: true };
}

/** Removes the secret. A failed write rejects with `DbWriteError`. */
export async function deleteSecret(key: SecretKey, database: Dexie = db): Promise<void> {
  await write([CORE_TABLES.secrets], () => secretsTable(database).delete(key), database);
}

/** The key with every character except the last four replaced by "•" (R5.7). */
export function maskKey(k: string): string {
  return '•'.repeat(Math.max(0, k.length - 4)) + k.slice(-4);
}
