import { z } from 'zod';
import { ProfileSchema } from '../profile/schema';
import { BACKUP_FORMAT } from './format';

/** Strict base64 (RFC 4648 §4, padded, no whitespace). The empty string encodes zero bytes. */
export const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * The part every Backup_File version shares: the format identifier and a Schema_Version that is an integer
 * of at least 1 (R7.3). Checked before anything else in the file is read.
 */
export const BackupEnvelope = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().min(1),
});
export type BackupEnvelope = z.infer<typeof BackupEnvelope>;

/** One `core_settings` record in a Backup_File. The value is checked against the key's schema separately. */
export const BackupSettingRecord = z.object({ key: z.string(), value: z.unknown() });

/** One module entry: the module id, its data version and the output of its `exportData()` (R6.1). */
export const BackupModuleEntry = z.object({
  id: z.string(),
  dataVersion: z.number().int().min(1),
  data: z.unknown(),
});
export type BackupModuleEntry = z.infer<typeof BackupModuleEntry>;

/** A Backup_File at Schema_Version 1 (R6.1). */
export const BackupV1 = BackupEnvelope.extend({
  schemaVersion: z.literal(1),
  appVersion: z.string().min(1),
  exportedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  core: z.object({
    profile: ProfileSchema.nullable(),
    settings: z.array(BackupSettingRecord),
  }),
  modules: z.array(BackupModuleEntry),
});
export type BackupV1 = z.infer<typeof BackupV1>;

/**
 * The file structure without record checks: every field of `BackupV1`, with the Profile left unchecked and
 * module entries checked only for a string id (an unregistered module's entry is skipped unvalidated, R7.7).
 */
export const BackupV1Header = BackupV1.extend({
  core: z.object({ profile: z.unknown(), settings: z.array(BackupSettingRecord) }),
  modules: z.array(z.looseObject({ id: z.string() })),
});

/**
 * A stored image inside a Backup_File: the bytes as base64 together with the MIME type and the pixel size
 * (R6.2). Modules use this in their backup schemas.
 */
export const BackupImageSchema = z.strictObject({
  id: z.string().min(1),
  mime: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  base64: z.string().regex(BASE64_PATTERN),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
});
export type BackupImage = z.infer<typeof BackupImageSchema>;
