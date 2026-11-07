import { monthsBack } from '../../../core/time/monthRange';
import type { LocalDate } from '../../../core/time/localDate';
import type { Session } from '../types';
import { bestE1rm, completedSetsOf, exerciseVolume, topWeight } from './metrics';
import type { PrType } from './pr';
export type ChartMetric = 'topWeight' | 'bestE1rm' | 'volume';
export type ChartRange = '1m' | '3m' | '6m' | '1y' | 'all';
export const CHART_METRICS: ReadonlyArray<{ value: ChartMetric; label: string }> = [
  { value: 'bestE1rm', label: 'Best E1RM' },
  { value: 'topWeight', label: 'Top weight' },
  { value: 'volume', label: 'Volume' },
];
export const CHART_RANGES: ReadonlyArray<{ value: ChartRange; label: string }> = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];
export const DEFAULT_METRIC: ChartMetric = 'bestE1rm';
export const DEFAULT_RANGE: ChartRange = '3m';
export const MIN_CHART_SESSIONS = 2;
const RANGE_MONTHS: Record<Exclude<ChartRange, 'all'>, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
export interface ChartPointData {
  date: LocalDate;
  startedAt: number;
  value: number;
  marked: boolean;
}
/** One point per finished Session with a Completed_Set of the exercise, ordered by start (R25.3, R25.5). */
export function chartPoints(
  exerciseId: string,
  finished: readonly Session[],
  metric: ChartMetric,
  prMarks: ReadonlyMap<string, readonly PrType[]>,
  toLocalDate: (ms: number) => LocalDate,
): ChartPointData[] {
  const points: ChartPointData[] = [];
  for (const session of [...finished].sort((a, b) => a.startedAt - b.startedAt)) {
    if (session.status !== 'finished') continue;
    const sets = completedSetsOf(session, exerciseId);
    if (sets.length === 0) continue;
    const value = metric === 'topWeight' ? topWeight(session, exerciseId) : metric === 'bestE1rm' ? bestE1rm(session, exerciseId) : exerciseVolume(session, exerciseId);
    points.push({
      date: toLocalDate(session.startedAt),
      startedAt: session.startedAt,
      value: value as number,
      marked: sets.some((s) => (prMarks.get(s.id) ?? []).some((t) => t === 'weight' || t === 'e1rm')),
    });
  }
  return points;
}
/** Points on or after the same day n calendar months before `today` (R25.4). */
export function inRange<T extends { date: LocalDate }>(points: readonly T[], today: LocalDate, range: ChartRange): T[] {
  if (range === 'all') return [...points];
  const from = monthsBack(today, RANGE_MONTHS[range]);
  return points.filter((p) => p.date >= from);
}
