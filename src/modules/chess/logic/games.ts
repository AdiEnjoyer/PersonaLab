import { monthsBack } from '../../../core/time/monthRange';
import { toLocalDate, type LocalDate } from '../../../core/time/localDate';
import { ANALYSER_VERSION } from '../constants';
import type { GamePlayer, GameRecord, OwnerResult } from '../types';
import { openingName } from './sync';

/** Newest first; equal end times by Idempotency_Key ascending (R45.1). */
export function sortGames(games: readonly GameRecord[]): GameRecord[] {
  return [...games].sort((a, b) => b.endTime - a.endTime || (a.idemKey < b.idemKey ? -1 : a.idemKey > b.idemKey ? 1 : 0));
}

export const RESULT_LABEL: Record<OwnerResult, string> = { win: 'Win', loss: 'Loss', draw: 'Draw', unknown: '?' };

export const ownerOf = (g: GameRecord): GamePlayer => (g.ownerColour === 'w' ? g.white : g.black);
export const opponentOf = (g: GameRecord): GamePlayer => (g.ownerColour === 'w' ? g.black : g.white);
export const gameOpening = (g: GameRecord): string => openingName(g.eco);

export interface GameFilters {
  timeClass: string;
  result: string;
  colour: string;
  opening: string;
}
export const NO_FILTERS: GameFilters = { timeClass: 'all', result: 'all', colour: 'all', opening: 'all' };

export const filtersActive = (f: GameFilters): boolean => f.timeClass !== 'all' || f.result !== 'all' || f.colour !== 'all' || f.opening !== 'all';

/** Exactly the games that satisfy every selected filter, order kept (R45.3). */
export function filterGames(games: readonly GameRecord[], f: GameFilters): GameRecord[] {
  return games.filter(
    (g) =>
      (f.timeClass === 'all' || g.timeClass === f.timeClass) &&
      (f.result === 'all' || g.ownerResult === f.result) &&
      (f.colour === 'all' || (f.colour === 'white' ? g.ownerColour === 'w' : g.ownerColour === 'b')) &&
      (f.opening === 'all' || gameOpening(g) === f.opening),
  );
}

/** Opening names present in the games, alphabetical. */
export function openingNames(games: readonly GameRecord[]): string[] {
  return [...new Set(games.map(gameOpening))].sort((a, b) => a.localeCompare(b));
}

export type AnalysisStatus = 'Not analysed' | 'Analysed' | 'Outdated' | 'Cannot analyse';

/** Analysis status of a row (R45.1). `reportVersion` is the stored Game_Report's analyser version, if any. */
export function analysisStatus(g: GameRecord, reportVersion: number | undefined): AnalysisStatus {
  if (g.pgnUnreadable) return 'Cannot analyse';
  if (reportVersion === undefined) return 'Not analysed';
  return reportVersion === ANALYSER_VERSION ? 'Analysed' : 'Outdated';
}

export type RatingRange = '1m' | '3m' | '1y' | 'all';
export const RATING_RANGES: ReadonlyArray<{ value: RatingRange; label: string }> = [
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All time' },
];
const RANGE_MONTHS = { '1m': 1, '3m': 3, '1y': 12 } as const;

export interface RatingPoint {
  endTime: number;
  date: LocalDate;
  rating: number;
}

/**
 * Rating history of one time class (R45.8): one point per rated game at the Owner's rating in that game,
 * oldest first. `rated` counts all rated points of the class before the range filter.
 */
export function ratingHistory(
  games: readonly GameRecord[],
  timeClass: string,
  range: RatingRange,
  today: LocalDate,
): { rated: number; points: RatingPoint[] } {
  const all: RatingPoint[] = [];
  for (const g of games) {
    const rating = ownerOf(g).rating;
    if (g.timeClass !== timeClass || !g.rated || rating === undefined) continue;
    all.push({ endTime: g.endTime, date: toLocalDate(g.endTime * 1000), rating });
  }
  all.sort((a, b) => a.endTime - b.endTime);
  if (range === 'all') return { rated: all.length, points: all };
  const from = monthsBack(today, RANGE_MONTHS[range]);
  return { rated: all.length, points: all.filter((p) => p.date >= from) };
}
