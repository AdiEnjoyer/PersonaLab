import { isQuotaError } from '../../../core/db/errors';
import { fetchWithTimeout } from '../../../core/net/fetchWithTimeout';
import { EXERCISE_IMAGE_CACHE } from '../constants';
import type { LibraryExercise } from '../types';
import { imageUrl } from './library';

export const DOWNLOAD_CONCURRENCY = 4;
export const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Every library image URL, in library order, each once. */
export function libraryImageUrls(library: readonly LibraryExercise[]): string[] {
  return [...new Set(library.flatMap((x) => x.images.map((i) => imageUrl(i.path))))];
}

export interface DownloadDeps {
  cache: Pick<Cache, 'match' | 'put'>;
  /** Resolves with a Response (200 only is stored) or rejects. */
  fetchImage(url: string): Promise<Response>;
}

export interface DownloadResult {
  /** Images in the cache at the end, including those cached before. */
  cached: number;
  total: number;
  /** True when a storage-full error stopped further requests (R13.10). */
  storageFull: boolean;
}

/**
 * Downloads every image that is not yet cached, 4 at a time, and reports "N of M" after each (R13.7).
 * Failures leave what is cached in place; a quota error stops new requests (R13.10).
 */
export async function downloadAllPhotos(urls: readonly string[], deps: DownloadDeps, onProgress: (cached: number, total: number) => void): Promise<DownloadResult> {
  const total = urls.length;
  const missing: string[] = [];
  let cached = 0;
  for (const url of urls) {
    if ((await deps.cache.match(url)) === undefined) missing.push(url);
    else cached += 1;
  }
  onProgress(cached, total);
  let storageFull = false;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (!storageFull && next < missing.length) {
      const url = missing[next++]!;
      try {
        const response = await deps.fetchImage(url);
        if (response.status !== 200) continue;
        await deps.cache.put(url, response);
        cached += 1;
        onProgress(cached, total);
      } catch (error) {
        if (isQuotaError(error)) storageFull = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, missing.length) }, worker));
  return { cached, total, storageFull };
}

/** The browser dependencies: the Cache API cache the service worker uses and a 30 s fetch. */
export async function browserDeps(): Promise<DownloadDeps> {
  const cache = await caches.open(EXERCISE_IMAGE_CACHE);
  return { cache, fetchImage: (url) => fetchWithTimeout(url, {}, DOWNLOAD_TIMEOUT_MS) };
}

/** The result Toast text (R13.7, R13.10). */
export function downloadMessage(r: DownloadResult): string {
  if (r.cached >= r.total) return 'All exercise photos are available offline.';
  return `${r.cached} of ${r.total} exercise photos are cached. The rest could not be downloaded${r.storageFull ? ' because device storage is full' : ''}.`;
}
