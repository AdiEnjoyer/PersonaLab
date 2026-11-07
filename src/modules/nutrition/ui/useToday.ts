import { useEffect, useState } from 'react';
import { addDays, startOfLocalDate, toLocalDate, type LocalDate } from '../../../core/time/localDate';

/**
 * Today's Local_Date. It changes at local midnight while the App is open and on return to the foreground
 * (R32.7).
 */
export function useToday(): LocalDate {
  const [today, setToday] = useState<LocalDate>(() => toLocalDate(Date.now()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const now = toLocalDate(Date.now());
      setToday(now);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(1000, startOfLocalDate(addDays(now, 1)) - Date.now() + 500));
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}