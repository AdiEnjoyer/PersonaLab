import { formatClock } from '../../../core/time/format';
import { addDays, type LocalDate } from '../../../core/time/localDate';
import { SPLIT, TRACKED_MUSCLES } from '../constants';
import type { Session } from '../types';
import { analyseSplit, type SplitInput } from './split';
export interface GymCardStats {
  sessionsLast7: number;
  last?: { date: LocalDate; routineName: string };
  lowOrUntrained: number;
}
export const EMPTY_SESSION_NAME = 'Empty session';
/** Values of the Gym DashboardCard (R28.1, R28.5). */
export function gymCardStats(
  sessions: readonly Session[],
  exercises: SplitInput['exercises'],
  today: LocalDate,
  toLocalDate: (ms: number) => LocalDate,
): GymCardStats {
  const finished = sessions.filter((s) => s.status === 'finished' && s.finishedAt !== undefined);
  const split = analyseSplit({ sessions: finished, exercises, windowEnd: today, toLocalDate });
  const from = addDays(today, -6);
  const sessionsLast7 = finished.filter((s) => {
    const d = toLocalDate(s.startedAt);
    return d >= from && d <= today;
  }).length;
  const lowOrUntrained = TRACKED_MUSCLES.filter((m) => split.weeklySets[m] < SPLIT.LOW_BELOW).length;
  let latest: Session | undefined;
  for (const s of finished) if (latest === undefined || (s.finishedAt as number) > (latest.finishedAt as number)) latest = s;
  return {
    sessionsLast7,
    lowOrUntrained,
    ...(latest === undefined ? {} : { last: { date: toLocalDate(latest.startedAt), routineName: latest.routineName ?? EMPTY_SESSION_NAME } }),
  };
}
/** Elapsed time since the start as M:SS or H:MM:SS (R28.2). */
export const elapsedLabel = (startedAt: number, now: number): string => formatClock(Math.floor((now - startedAt) / 1000));
