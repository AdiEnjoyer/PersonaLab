import { describe, expect, it } from 'vitest';
import type { Exercise, Routine, RoutineItem, Session, SetRecord } from '../../types';
import { canComplete, parseReps, parseWeight } from '../entry';
import { archiveImpact, findDuplicateName, validateCustomExercise } from '../exerciseForm';
import { formatE1rm, formatVolume, formatWeight } from '../format';
import { clearFilters, equipmentOptions, filterExercises, muscleOptions, sortExercises, EMPTY_QUERY } from '../library';
import { e1rm, exerciseVolume, isCompletedSet, sessionDurationMs, topSet, topWeight, volumeChange, type CompletedSet } from '../metrics';
import { prefillFor, previousLabel, referenceSets } from '../prefill';
import { detectPrs } from '../pr';
import { appendItems, moveDown, moveItem, moveUp, validateItemField, validateRoutineName } from '../routines';

const set = (id: string, weight: number | undefined, reps: number | undefined, completed = true, completedAt = 1): SetRecord => ({
  id,
  idemKey: id,
  ...(weight === undefined ? {} : { weight }),
  ...(reps === undefined ? {} : { reps }),
  weightSource: 'owner',
  repsSource: 'owner',
  completed,
  ...(completed ? { completedAt } : {}),
});

const session = (id: string, finishedAt: number, sets: SetRecord[], exerciseId = 'bench'): Session => ({
  id,
  status: 'finished',
  startedAt: finishedAt - 10,
  finishedAt,
  lastChangeAt: finishedAt,
  entries: [{ entryId: `e-${id}`, exerciseId, sets }],
});

describe('metrics', () => {
  it('computes E1RM, volume, top weight and top set', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.6667, 3);
    expect(formatE1rm(e1rm(100, 5))).toBe('116.7');
    expect(e1rm(100, 1)).toBe(100);
    const s = session('a', 100, [set('1', 100, 5), set('2', 80, 10), set('3', 50, 0), set('4', 200, 3, false), set('5', Number.NaN, 5)]);
    expect(exerciseVolume(s, 'bench')).toBe(500 + 800);
    expect(topWeight(s, 'bench')).toBe(100);
    expect(topWeight(s, 'none')).toBeUndefined();
    expect(isCompletedSet(set('6', 1001, 5))).toBe(false);
  });

  it('breaks top-set ties by weight, then earlier completion', () => {
    const a = set('a', 100, 1, true, 5) as CompletedSet;
    const b = set('b', 90, 4, true, 1) as CompletedSet; // 90 * (1 + 4/30) = 102 > 100
    expect(topSet([a, b])?.id).toBe('b');
    const c = set('c', 100, 1, true, 3) as CompletedSet;
    expect(topSet([a, c])?.id).toBe('c');
    expect(topSet([])).toBeUndefined();
  });

  it('reports volume change and duration', () => {
    expect(volumeChange(10, undefined)).toEqual({ kind: 'first' });
    expect(volumeChange(10, 0)).toEqual({ kind: 'change', deltaKg: 10 });
    expect(volumeChange(150, 100)).toEqual({ kind: 'change', deltaKg: 50, pct: 50 });
    expect(sessionDurationMs({ startedAt: 10, finishedAt: 5 })).toBe(0);
  });

  it('formats weights and volume', () => {
    expect(formatWeight(102.5)).toBe('102.5');
    expect(formatWeight(100)).toBe('100');
    expect(formatWeight(1.25)).toBe('1.25');
    expect(formatVolume(1299.5)).toBe('1300');
  });
});

describe('entry parsing', () => {
  it('accepts . and , and rejects out-of-range text', () => {
    expect(parseWeight('82,5')).toBe(82.5);
    expect(parseWeight('1000')).toBe(1000);
    expect(parseWeight('1000.01')).toBeNull();
    expect(parseWeight('10.123')).toBeNull();
    expect(parseWeight('abc')).toBeNull();
    expect(parseWeight('')).toBeNull();
    expect(parseReps('100')).toBe(100);
    expect(parseReps('101')).toBeNull();
    expect(parseReps('5.5')).toBeNull();
    expect(parseReps('0')).toBe(0);
  });

  it('completes only with a valid weight and reps >= 1', () => {
    expect(canComplete({ weight: 0, reps: 1 })).toEqual({ ok: true });
    expect(canComplete({ weight: 20, reps: 0 })).toEqual({ ok: false, invalid: ['reps'] });
    expect(canComplete({})).toEqual({ ok: false, invalid: ['weight', 'reps'] });
  });
});

describe('prefill', () => {
  const finished = [session('old', 100, [set('1', 50, 10)]), session('new', 200, [set('2', 60, 8), set('3', 62.5, 6)]), session('other', 300, [set('4', 5, 5)], 'squat')];
  it('uses the latest finished session containing the exercise', () => {
    const ref = referenceSets('bench', finished);
    expect(ref?.map((s) => s.id)).toEqual(['2', '3']);
    expect(prefillFor(1, ref)).toEqual({ weight: 60, reps: 8 });
    expect(prefillFor(5, ref)).toEqual({ weight: 62.5, reps: 6 });
    expect(previousLabel(2, ref)).toBe('62.5 kg × 6');
    expect(previousLabel(3, ref)).toBe('—');
  });
  it('falls back to the routine minimum reps without history', () => {
    expect(referenceSets('curl', finished)).toBeUndefined();
    expect(prefillFor(1, undefined, 8)).toEqual({ reps: 8 });
    expect(prefillFor(1, undefined)).toEqual({});
  });
});

describe('PR examples', () => {
  it('marks weight, e1rm and rep PRs and none for the first set', () => {
    const base = { sessionStartedAt: 0, position: 0 };
    const marks = detectPrs([
      { setId: 'a', weight: 100, reps: 5, completedAt: 1, ...base },
      { setId: 'b', weight: 100, reps: 5, completedAt: 2, ...base },
      { setId: 'c', weight: 100, reps: 6, completedAt: 3, ...base },
      { setId: 'd', weight: 105, reps: 1, completedAt: 4, ...base },
    ]);
    expect(marks.get('a')).toEqual([]);
    expect(marks.get('b')).toEqual([]);
    expect(marks.get('c')).toEqual(['e1rm', 'reps']);
    expect(marks.get('d')).toEqual(['weight']);
  });
});

const ex = (over: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise => ({
  source: 'library',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: 'barbell',
  instructions: [],
  photos: [],
  archived: false,
  ...over,
});

describe('library', () => {
  const list: Exercise[] = [
    ex({ id: 'b', name: 'Bench Press', secondaryMuscles: ['triceps'] }),
    ex({ id: 'c1', name: 'cable fly', primaryMuscles: ['chest'], equipment: 'cable' }),
    ex({ id: 'c2', name: 'Cable Fly', source: 'custom', equipment: 'cable' }),
    ex({ id: 'é', name: 'Élan Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' }),
    ex({ id: 'h', name: 'Hidden', archived: true, primaryMuscles: ['neck'] }),
  ];
  it('sorts ignoring case and diacritics, custom first on ties', () => {
    expect(sortExercises(list).map((x) => x.id)).toEqual(['b', 'c2', 'c1', 'é', 'h']);
  });
  it('filters by text, muscle, secondary toggle and equipment; hides archived', () => {
    expect(filterExercises(list, { ...EMPTY_QUERY, text: '  elan ' }).map((x) => x.id)).toEqual(['é']);
    expect(filterExercises(list, { ...EMPTY_QUERY, muscles: ['triceps'] })).toEqual([]);
    expect(filterExercises(list, { ...EMPTY_QUERY, muscles: ['triceps'], includeSecondary: true }).map((x) => x.id)).toEqual(['b']);
    expect(filterExercises(list, { ...EMPTY_QUERY, equipment: ['cable'], muscles: ['chest'] }).map((x) => x.id)).toEqual(['c2', 'c1']);
    expect(filterExercises(list, EMPTY_QUERY)).toHaveLength(4);
  });
  it('offers options from non-archived exercises and keeps the toggle on clear', () => {
    expect(muscleOptions(list)).toEqual(['biceps', 'chest', 'triceps']);
    expect(equipmentOptions(list)).toEqual(['barbell', 'cable', 'dumbbell']);
    expect(clearFilters({ text: 'x', muscles: ['chest'], equipment: ['cable'], includeSecondary: true })).toEqual({ ...EMPTY_QUERY, includeSecondary: true });
  });
});

describe('custom exercise form', () => {
  it('names every failing field', () => {
    const r = validateCustomExercise({ name: '  ', primaryMuscles: [], secondaryMuscles: [], equipment: undefined });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['equipment', 'name', 'primaryMuscles']);
    const overlap = validateCustomExercise({ name: 'x', primaryMuscles: ['chest'], secondaryMuscles: ['chest'], equipment: 'cable' });
    expect(overlap).toMatchObject({ ok: false, errors: { secondaryMuscles: expect.any(String) } });
    expect(validateCustomExercise({ name: ' Row ', primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], equipment: 'cable' })).toMatchObject({ ok: true, value: { name: 'Row' } });
    expect(validateCustomExercise({ name: 'x'.repeat(81), primaryMuscles: ['lats'], secondaryMuscles: [], equipment: 'cable' }).ok).toBe(false);
  });
  it('finds duplicates among non-archived exercises, excluding itself', () => {
    const list = [ex({ id: '1', name: 'Row' }), ex({ id: '2', name: 'Old', archived: true })];
    expect(findDuplicateName(' row ', list)?.id).toBe('1');
    expect(findDuplicateName('row', list, '1')).toBeUndefined();
    expect(findDuplicateName('old', list)).toBeUndefined();
  });
  it('lists routines affected by an archive', () => {
    const item = (itemId: string, exerciseId: string): RoutineItem => ({ itemId, exerciseId, targetSets: 3, repMin: 8, repMax: 12 });
    const routines: Routine[] = [
      { id: 'r1', idemKey: 'k', name: 'A', items: [item('1', 'x'), item('2', 'y'), item('3', 'x')], createdAt: 0, updatedAt: 0 },
      { id: 'r2', idemKey: 'k2', name: 'B', items: [item('4', 'y')], createdAt: 0, updatedAt: 0 },
    ];
    expect(archiveImpact(routines, 'x')).toEqual([{ routineId: 'r1', routineName: 'A', itemCount: 2 }]);
    expect(archiveImpact(routines, 'none')).toEqual([]);
  });
});

describe('routines', () => {
  const item: RoutineItem = { itemId: 'i', exerciseId: 'x', targetSets: 3, repMin: 8, repMax: 12 };
  it('validates names', () => {
    expect(validateRoutineName('  Push  ')).toEqual({ ok: true, name: 'Push' });
    expect(validateRoutineName('   ').ok).toBe(false);
    expect(validateRoutineName('a'.repeat(61)).ok).toBe(false);
  });
  it('validates item fields', () => {
    expect(validateItemField('targetSets', '10', item)).toEqual({ ok: true, value: 10 });
    expect(validateItemField('targetSets', '11', item).ok).toBe(false);
    expect(validateItemField('targetSets', '2.5', item).ok).toBe(false);
    expect(validateItemField('repMin', '13', item)).toEqual({ ok: false, message: 'Minimum reps must not exceed maximum reps' });
    expect(validateItemField('repMax', '7', item)).toMatchObject({ ok: false });
    expect(validateItemField('restSec', '', item)).toEqual({ ok: true, value: undefined });
    expect(validateItemField('restSec', '45', item)).toEqual({ ok: true, value: 45 });
    expect(validateItemField('restSec', '50', item).ok).toBe(false);
    expect(validateItemField('restSec', '10', item).ok).toBe(false);
  });
  it('appends items with defaults up to the 50 cap and reorders without losing items', () => {
    let n = 0;
    const r: Routine = { id: 'r', idemKey: 'k', name: 'R', items: [], createdAt: 0, updatedAt: 0 };
    const added = appendItems(r, ['a', 'b', 'a'], () => `id${++n}`);
    expect(added.items.map((i) => [i.exerciseId, i.targetSets, i.repMin, i.repMax])).toEqual([['a', 3, 8, 12], ['b', 3, 8, 12], ['a', 3, 8, 12]]);
    const full = appendItems(r, Array.from({ length: 60 }, (_, i) => `e${i}`), () => `id${++n}`);
    expect(full.items).toHaveLength(50);
    expect(appendItems(full, ['z'], () => 'q').items).toHaveLength(50);
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveUp([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(moveDown([1, 2, 3], 1)).toEqual([1, 3, 2]);
  });
});
