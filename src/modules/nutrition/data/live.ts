import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/** Live value of `read` with an error state and a retry. `value` is undefined while the first read is pending. */
export function useLiveValue<T>(read: () => Promise<T>, deps: readonly unknown[]): { value: T | undefined; failed: boolean; retry(): void } {
  const [state, setState] = useState<{ value: T | undefined; failed: boolean }>({ value: undefined, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const subscription = liveQuery(read).subscribe({
      next: (value) => setState({ value, failed: false }),
      error: () => setState({ value: undefined, failed: true }),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}