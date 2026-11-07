import { useEffect, useRef, useState } from 'react';

export interface SkeletonGateOptions {
  delayMs?: number;
  minVisibleMs?: number;
}

/**
 * `blank` for the first `delayMs` of loading, then `skeleton`; data arriving earlier goes straight to
 * `content`. Once shown, the skeleton stays at least `minVisibleMs` (R62.1 to R62.3).
 */
export function useSkeletonGate(loading: boolean, opts: SkeletonGateOptions = {}): 'content' | 'skeleton' | 'blank' {
  const { delayMs = 150, minVisibleMs = 200 } = opts;
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (loading) {
      if (shown) return undefined;
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, delayMs);
      return () => clearTimeout(timer);
    }
    if (!shown) return undefined;
    const remaining = minVisibleMs - (Date.now() - shownAt.current);
    if (remaining <= 0) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(false), remaining);
    return () => clearTimeout(timer);
  }, [loading, shown, delayMs, minVisibleMs]);

  if (loading) return shown ? 'skeleton' : 'blank';
  return shown ? 'skeleton' : 'content';
}
