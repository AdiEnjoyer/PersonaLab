import { useEffect, useState } from 'react';

/** The current time, refreshed every minute so "Updated N min ago" stays right (R65.1). */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
