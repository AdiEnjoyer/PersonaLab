/** The exact Backup_File import messages of Requirement 7. */
export const IMPORT_MESSAGES = {
  /** R7.14 */
  unreadable: 'The file could not be read.',
  /** R7.2 */
  notJson: 'This file is not a PersonalLab backup (not valid JSON).',
  /** R7.3 */
  notBackup: 'This file is not a PersonalLab backup.',
  /** R7.4, file Schema_Version above the supported one. */
  newerFile: (fileVersion: number, supportedVersion: number) =>
    `This backup was made by a newer version (file v${fileVersion}, supported v${supportedVersion}). Update the app.`,
  /** R7.4, a registered module's data version above the version the module supports. */
  newerModule: (fileVersion: number, supportedVersion: number, moduleId: string) =>
    `This backup was made by a newer version (file v${fileVersion}, supported v${supportedVersion}, module ${moduleId}). Update the app.`,
  /** R7.13 */
  migrationFailed: (schemaVersion: number) => `This backup (version ${schemaVersion}) could not be upgraded.`,
  /** R7.5: section (core data or the module id), 1-based record position and field path. */
  invalidRecord: (section: string, position: number, field: string) =>
    `Invalid record in ${section}, record ${position}: ${field}.`,
  /** R7.10: the import transaction failed and nothing was changed; `reason` is the short write-failure reason. */
  applyFailed: (reason: string) => `Backup not imported: ${reason}. Your data is unchanged.`,
} as const;

/** Error Toast texts of a failed export (R6.10, R8.7, R9.7). */
export const EXPORT_MESSAGES = {
  /** Reading core data, images or a module's `exportData()` failed; `part` names it. */
  readFailed: (part: string) => `Backup not created: ${part} could not be read.`,
  /** The new file failed its own import validation; `detail` is the R7 message. */
  invalidFile: (detail: string) => `Backup not created: ${detail}`,
  /** Defence for R6.3: the serialised file would contain the Gemini key. */
  containsSecret: 'Backup not created: the file would contain the Gemini key.',
  /** Neither the share sheet nor the download could be started. */
  deliveryFailed: 'Backup not created: the file could not be shared or downloaded.',
} as const;
