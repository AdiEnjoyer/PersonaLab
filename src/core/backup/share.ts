import { errorName } from '../db/errorChain';

/** How the Backup_File left the App: shared through the share sheet, downloaded, or not at all. */
export type ShareResult = 'shared' | 'downloaded' | 'dismissed';

/** Time before the download's object URL is revoked; Safari starts the download asynchronously. */
const REVOKE_DELAY_MS = 60_000;

/** True when the Web Share API reports it can share `file`. A throwing `canShare` means it cannot. */
function canShareFile(nav: Navigator | undefined, file: File): nav is Navigator {
  if (nav === undefined || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Starts a download of `file` under its own name through an `<a download>` link and an object URL (R6.6). */
export function downloadFile(file: File, doc: Document = document): void {
  const url = URL.createObjectURL(file);
  const link = doc.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

/**
 * Opens the share sheet with `file` when the Web Share API can share it (R6.5): a completed share is
 * `shared`, an `AbortError` (the Owner dismissed the sheet) is `dismissed` (R6.8), and any other rejection
 * falls back to a download (R6.9). Without file sharing support the file is downloaded (R6.6).
 */
export async function shareOrDownload(file: File): Promise<ShareResult> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (canShareFile(nav, file)) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (errorName(error) === 'AbortError') return 'dismissed';
    }
  }
  downloadFile(file);
  return 'downloaded';
}
