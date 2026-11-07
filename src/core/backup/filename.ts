const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/**
 * The Backup_File name for an export at `date`: `personallab-backup-YYYY-MM-DD-HHmm.json`, with the date and
 * the zero-padded 24-hour time in local time (R6.4).
 */
export function backupFileName(date: Date): string {
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
  const time = `${pad(date.getHours(), 2)}${pad(date.getMinutes(), 2)}`;
  return `personallab-backup-${day}-${time}.json`;
}
