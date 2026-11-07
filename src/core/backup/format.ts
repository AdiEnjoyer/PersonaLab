/** The format identifier of every Backup_File (R6.1, R7.3). */
export const BACKUP_FORMAT = 'personallab-backup';

/** The Backup_File Schema_Version this App writes and the highest one it reads (R7.4). */
export const SUPPORTED_SCHEMA_VERSION = 1;

/** MIME type of a Backup_File (UTF-8 JSON, R6.4). */
export const BACKUP_MIME_TYPE = 'application/json';

/** The section name used for core data in import messages (R7.5) and export failures (R6.10). */
export const CORE_SECTION = 'core data';

// Replaced at build time by Vite's `define` (task 9.1). In tests and before the build defines it, the
// identifier does not exist, so `typeof` is checked first and the package version is used.
declare const __APP_VERSION__: string | undefined;

/** The App version written into Backup_Files (R6.1). */
export const BACKUP_APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ !== '' ? __APP_VERSION__ : '1.0.0';

/** The export timestamp in ISO 8601 UTC with seconds and a `Z` suffix, e.g. `2025-03-07T07:05:00Z` (R6.1). */
export function toExportedAt(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
