import { useEffect, useState } from 'react';
import { LibraryFileSchema } from '../schema';
import type { LibraryExercise } from '../types';

export type LibraryStatus = 'loading' | 'ready' | 'missing';

/** URL of `exercises/exercises.json` under the app base. */
export const libraryUrl = (): string => `${import.meta.env.BASE_URL}exercises/exercises.json`;

/** URL of one exercise image (`path` is relative to `exercises/img/`). */
export const imageUrl = (path: string): string => `${import.meta.env.BASE_URL}exercises/img/${path.split('/').map(encodeURIComponent).join('/')}`;

let cached: Promise<LibraryExercise[] | null> | null = null;

/**
 * Loads the bundled library once per App run. A missing, unreadable or invalid file gives `null`
 * (the screens then show the "run npm run data:exercises" empty state). A network failure is not cached,
 * so the next screen tries again.
 */
export function loadLibrary(fetchFn: typeof fetch = fetch): Promise<LibraryExercise[] | null> {
  if (cached !== null) return cached;
  const attempt = (async (): Promise<LibraryExercise[] | null> => {
    let response: Response;
    try {
      response = await fetchFn(libraryUrl());
    } catch {
      cached = null;
      return null;
    }
    if (!response.ok) return null;
    try {
      const parsed = LibraryFileSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // e.g. the dev server answers a missing file with index.html
    }
  })();
  cached = attempt;
  return attempt;
}

/** For tests. */
export function resetLibraryCache(): void {
  cached = null;
}

export function useLibrary(): { status: LibraryStatus; library: LibraryExercise[] } {
  const [state, setState] = useState<{ status: LibraryStatus; library: LibraryExercise[] }>({ status: 'loading', library: [] });
  useEffect(() => {
    let live = true;
    void loadLibrary().then((library) => {
      if (live) setState(library === null || library.length === 0 ? { status: 'missing', library: [] } : { status: 'ready', library });
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
