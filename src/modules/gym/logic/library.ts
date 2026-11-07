import { compareFolded } from '../../../core/text/compare';
import { fold } from '../../../core/text/fold';
import { LIMITS } from '../constants';
import type { Equipment, Exercise, Muscle } from '../types';

export interface LibraryQuery {
  text: string;
  muscles: Muscle[];
  equipment: Equipment[];
  includeSecondary: boolean;
}

export const EMPTY_QUERY: LibraryQuery = { text: '', muscles: [], equipment: [], includeSecondary: false };

/** Name order ignoring case and diacritics; custom before library on equal names; then id (R14.1). */
export function sortExercises<T extends Pick<Exercise, 'id' | 'name' | 'source'>>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => {
    const byName = compareFolded(a.name, b.name);
    if (byName !== 0) return byName;
    if (a.source !== b.source) return a.source === 'custom' ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export const matchesText = (x: Pick<Exercise, 'name'>, q: string): boolean => {
  const t = q.trim();
  return t === '' || fold(x.name).includes(fold(t.slice(0, LIMITS.SEARCH_TEXT)));
};

export const matchesMuscles = (x: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'>, ms: readonly Muscle[], includeSecondary: boolean): boolean =>
  ms.length === 0 || ms.some((m) => x.primaryMuscles.includes(m) || (includeSecondary && x.secondaryMuscles.includes(m)));

export const matchesEquipment = (x: Pick<Exercise, 'equipment'>, es: readonly Equipment[]): boolean => es.length === 0 || es.includes(x.equipment);

/** The sorted intersection of the three filters (R14.6). Archived exercises are not listed (R16.3). */
export function filterExercises<T extends Exercise>(xs: readonly T[], q: LibraryQuery): T[] {
  return sortExercises(
    xs.filter((x) => !x.archived && matchesText(x, q.text) && matchesMuscles(x, q.muscles, q.includeSecondary) && matchesEquipment(x, q.equipment)),
  );
}

const alphabetical = <T extends string>(set: Set<T>): T[] => [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Every muscle that is primary or secondary of a non-archived exercise (R14.3). */
export function muscleOptions(xs: readonly Exercise[]): Muscle[] {
  const set = new Set<Muscle>();
  for (const x of xs) if (!x.archived) for (const m of [...x.primaryMuscles, ...x.secondaryMuscles]) set.add(m);
  return alphabetical(set);
}

/** Every equipment type of a non-archived exercise (R14.5). */
export function equipmentOptions(xs: readonly Exercise[]): Equipment[] {
  return alphabetical(new Set(xs.filter((x) => !x.archived).map((x) => x.equipment)));
}

export const isDefaultQuery = (q: LibraryQuery): boolean => q.text.trim() === '' && q.muscles.length === 0 && q.equipment.length === 0;

/** "Clear filters": empties text, muscles and equipment; the secondary toggle stays (R14.8). */
export const clearFilters = (q: LibraryQuery): LibraryQuery => ({ ...EMPTY_QUERY, includeSecondary: q.includeSecondary });
