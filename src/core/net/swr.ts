import { useCallback, useEffect, useRef, useState } from 'react';
import { isOnline, useOnline } from './online';

export type RemoteState = 'fresh' | 'refreshing' | 'failed' | 'offline';

export interface RemoteOptions<T> {
  /** Identifies the resource; components with the same key share one in-flight fetch (R65.2). */
  key: string;
  /** Cached data and when it was fetched, or null when nothing is cached. */
  readCache: () => Promise<{ data: T; fetchedAt: number } | null> | { data: T; fetchedAt: number } | null;
  /** Fetches and stores fresh data; resolves to it with its fetch time. */
  fetchFresh: () => Promise<{ data: T; fetchedAt: number }>;
  maxAgeMs: number;
  enabled?: boolean;
}

export interface RemoteResource<T> {
  data: T | null;
  fetchedAt: number | null;
  state: RemoteState;
  retry: () => void;
}

const inFlight = new Map<string, Promise<unknown>>();

function shared<R>(key: string, start: () => Promise<R>): Promise<R> {
  const existing = inFlight.get(key) as Promise<R> | undefined;
  if (existing) return existing;
  const promise = start().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** Shows cached data at once, refreshes in the background when stale and online, and keeps data on failure (R65.2 to R65.4). */
export function useRemoteResource<T>(options: RemoteOptions<T>): RemoteResource<T> {
  const { key, maxAgeMs, enabled = true } = options;
  const { online } = useOnline();
  const latest = useRef(options);
  latest.current = options;
  const [entry, setEntry] = useState<{ data: T; fetchedAt: number } | null>(null);
  const [state, setState] = useState<RemoteState>('fresh');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const cached = await latest.current.readCache();
      if (cancelled) return;
      setEntry(cached);
      setLoaded(true);
      const stale = cached === null || Date.now() - cached.fetchedAt > maxAgeMs;
      if (!stale) return setState('fresh');
      if (!online || !isOnline()) return setState('offline');
      setState('refreshing');
      try {
        const fresh = await shared(key, () => latest.current.fetchFresh());
        if (cancelled) return;
        setEntry(fresh);
        setState('fresh');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, maxAgeMs, enabled, online, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data: entry?.data ?? null, fetchedAt: entry?.fetchedAt ?? null, state: loaded || !enabled ? state : 'refreshing', retry };
}