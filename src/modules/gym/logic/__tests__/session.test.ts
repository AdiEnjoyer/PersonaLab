import { describe, expect, it } from 'vitest';
import type { Routine, Session, SetRecord } from '../../types';
import { chartPoints, inRange } from '../charts';
import { elapsedLabel, gymCardStats } from '../dashboard';
import { prMarksForExercise } from '../pr';
import { minus15, plus15, remainingLabel, restView } from '../restTimer';
import {
  addExercises,
  addSet,
  adjustRest,
  completeSet,
  editSetField,
  finish,
  finishPlan,
  lastCompletionTime,
  moveEntry,
  removeEntry,
  removeSet,
  restoreRemoved,
  resumeDecision,
  startEmpty,
  startFromRoutine,
} from '../session';
import { analyseSplit, EMPTY_SPLIT_MESSAGE } from '../split';
import { finishSummary } from '../summary';
let counter = 0;
const ctx = (now = 1000) => ({ now, newId: () => `id${++counter}` });
const done = (id: string, weight: number, reps: number, completedAt = 5): SetRecord => ({ id, idemKey: id, weight, reps, weightSource: 'owner', repsSource: 'owner', completed: true, completedAt });
const finished = (id: string, startedAt: number, exerciseId: string, sets: SetRecord[], extra: Partial<Session> = {}): Session => ({
  id,
  status: 'finished',
  startedAt,
  finishedAt: startedAt + 3_600_000,
  lastChangeAt: startedAt,
  entries: [{ entryId: `e${id}`, exerciseId, sets }],
  ...extra,
});
const routine: Routine = {
  id: 'r1',
  idemKey: 'k',
  name: 'Push',
  createdAt: 0,
  updatedAt: 0,
  items: [
    { itemId: 'i1', exerciseId: 'bench', targetSets: 2, repMin: 8, repMax: 12, restSec: 120 },
    { itemId: 'i2', exerciseId: 'fly', targetSets: 1, repMin: 10, repMax: 15 },
  ],
};
describe('session operations', () => {
  it('starts from a routine, pre-filling from the latest finished session or from the rep minimum', () => {
    const history = [finished('h', 100, 'bench', [done('a', 80, 5), done('b', 82.5, 4)])];
    const s = startFromRoutine(routine, history, ctx());
    expect(s.routineName).toBe('Push');
    expect(s.entries.map((e) => e.sets.length)).toEqual([2, 1]);
    expect(s.entries[0]!.sets.map((x) => [x.weight, x.reps, x.weightSource])).toEqual([[80, 5, 'prefill'], [82.5, 4, 'prefill']]);
    expect(s.entries[1]!.sets[0]).toMatchObject({ reps: 10, repsSource: 'prefill', weightSource: 'owner' });
    expect(s.entries[1]!.sets[0]!.weight).toBeUndefined();
  });
  it('adds exercises once, extra sets to existing entries and stops at 20 sets', () => {
    let s = addExercises(startEmpty(ctx()), ['bench', 'fly', 'bench'], [], ctx());
    expect(s.entries.map((e) => e.sets.length)).toEqual([1, 1]);
    s = addExercises(s, ['bench'], [], ctx());
    expect(s.entries[0]!.sets).toHaveLength(2);
    for (let i = 0; i < 25; i++) s = addSet(s, s.entries[0]!.entryId, [], ctx());
    expect(s.entries[0]!.sets).toHaveLength(20);
  });
  it('removes then restores sets and entries at their original positions', () => {
    const s = startFromRoutine(routine, [], ctx());
    const entry = s.entries[0]!;
    const r = removeSet(s, entry.entryId, entry.sets[0]!.id)!;
    expect(r.session.entries[0]!.sets).toHaveLength(1);
    expect(restoreRemoved(r.session, r.undo)).toEqual(s);
    const e = removeEntry(s, entry.entryId)!;
    expect(e.session.entries).toHaveLength(1);
    expect(restoreRemoved(e.session, e.undo)).toEqual(s);
  });
  it('reorders only the moved entry', () => {
    const s = startFromRoutine(routine, [], ctx());
    expect(moveEntry(s, 0, 1).entries.map((e) => e.exerciseId)).toEqual(['fly', 'bench']);
    expect(moveEntry(s, 0, 5)).toBe(s);
  });
  it('validates field edits and the completion gate', () => {
    let s = startFromRoutine(routine, [], ctx());
    const [entry] = s.entries;
    const id = entry!.sets[0]!.id;
    s = editSetField(s, entry!.entryId, id, 'weight', '1001');
    expect(s.entries[0]!.sets[0]!.weight).toBeUndefined();
    const bad = completeSet(s, entry!.entryId, id, 50, 90);
    expect(bad).toEqual({ ok: false, invalid: ['weight'] });
    s = editSetField(s, entry!.entryId, id, 'weight', '82,5');
    const ok = completeSet(s, entry!.entryId, id, 50, 90);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.session.entries[0]!.sets[0]).toMatchObject({ completed: true, completedAt: 50, weight: 82.5, weightSource: 'owner', repsSource: 'owner' });
    expect(ok.session.restTimer).toEqual({ endAt: 50 + 90_000 });
    const cleared = editSetField(ok.session, entry!.entryId, id, 'reps', '0');
    expect(cleared.entries[0]!.sets[0]!.completed).toBe(false);
  });
  it('finishes with exactly the completed sets and plans prompts', () => {
    let s = startFromRoutine(routine, [], ctx());
    const [bench] = s.entries;
    s = editSetField(s, bench!.entryId, bench!.sets[0]!.id, 'weight', '60');
    const c = completeSet(s, bench!.entryId, bench!.sets[0]!.id, 77, 90);
    if (!c.ok) throw new Error('expected ok');
    expect(finishPlan(c.session)).toEqual({ incomplete: 2, completed: 1 });
    expect(finishPlan(s)).toEqual({ incomplete: 3, completed: 0 });
    const f = finish(c.session, 100);
    expect(f.status).toBe('finished');
    expect(f.entries.map((e) => e.sets.length)).toEqual([1]);
    expect(f.restTimer).toBeUndefined();
    expect(lastCompletionTime(c.session)).toBe(77);
  });
  it('decides the start-up prompt by the last change and completed sets', () => {
    const base = finished('x', 0, 'bench', [done('a', 50, 5, 9)], { status: 'active', lastChangeAt: 1000 });
    expect(resumeDecision(base, 1000 + 10_800_000)).toBe('resume');
    expect(resumeDecision(base, 1001 + 10_800_000)).toBe('stale-with-finish');
    expect(resumeDecision({ ...base, entries: [] }, 1001 + 10_800_000)).toBe('stale-no-finish');
  });
});
describe('rest timer', () => {
  it('adjusts, caps and ends', () => {
    expect(minus15(100_000, 80_000)).toEqual({ endAt: 85_000 });
    expect(minus15(100_000, 85_000)).toBe('ended');
    expect(plus15(100_000, 80_000)).toEqual({ endAt: 115_000 });
    expect(plus15(1_000_000, 0)).toEqual({ endAt: 600_000 });
    expect(remainingLabel(61_001, 0)).toBe('1:02');
    expect(restView({ endAt: 5 }, 10)).toEqual({ kind: 'alert' });
    expect(restView({ endAt: 5, alertDismissed: true }, 10)).toEqual({ kind: 'none' });
  });
  it('skip removes the timer, dismiss keeps the end', () => {
    const s: Session = { ...startEmpty(ctx()), restTimer: { endAt: 50_000 } };
    expect(adjustRest(s, 'skip', 0).restTimer).toBeUndefined();
    expect(adjustRest(s, 'dismiss', 0).restTimer).toEqual({ endAt: 50_000, alertDismissed: true });
    expect(adjustRest(s, 'minus15', 45_000).restTimer).toEqual({ endAt: 45_000 });
  });
});
describe('finish summary', () => {
  it('reports top set, PRs and volume change against the previous session', () => {
    const prev = finished('p', 1_000, 'bench', [done('a', 80, 5, 1)]);
    const cur = finished('c', 10_000, 'bench', [done('b', 85, 5, 2), done('d', 80, 5, 3)]);
    const sum = finishSummary(cur, [prev]);
    expect(sum.completedSets).toBe(2);
    expect(sum.totalVolume).toBe(825);
    expect(sum.exercises[0]!.topSet.id).toBe('b');
    expect(sum.exercises[0]!.change).toEqual({ kind: 'change', deltaKg: 425, pct: 106.25 });
    expect(sum.prs.map((p) => p.set.id)).toContain('b');
    expect(finishSummary(prev, [prev]).exercises[0]!.change).toEqual({ kind: 'first' });
    expect(prMarksForExercise([prev, cur], 'bench').get('b')).toContain('weight');
  });
});
describe('split flags', () => {
  const exercises = new Map([
    ['bench', { primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] }],
    ['row', { primaryMuscles: ['middle back'], secondaryMuscles: ['biceps'] }],
  ]);
  const toLocalDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const day = (d: number) => Date.UTC(2025, 2, d, 12);
  const sets = (n: number) => Array.from({ length: n }, (_, i) => done(`s${i}`, 50, 5));
  it('reports the empty state without flags', () => {
    const r = analyseSplit({ sessions: [], exercises, windowEnd: '2025-03-10', toLocalDate });
    expect(r.flags).toEqual([]);
    expect(r.emptyMessage).toBe(EMPTY_SPLIT_MESSAGE);
    expect(r.sessionCount).toBe(0);
  });
  it('orders flags and formats messages', () => {
    const sessions = [finished('a', day(8), 'bench', sets(8)), finished('b', day(8), 'row', sets(2))];
    const r = analyseSplit({ sessions, exercises, windowEnd: '2025-03-10', toLocalDate });
    expect(r.weeklySets.chest).toBe(8);
    expect(r.weeklySets.triceps).toBe(4);
    expect(r.classes.chest).toBe('low');
    const types = r.flags.map((f) => f.type);
    expect(types.indexOf('untrained')).toBe(0);
    expect(types.indexOf('pushPull')).toBeGreaterThan(types.lastIndexOf('untrained'));
    expect(types.indexOf('onceAWeek')).toBeGreaterThan(types.indexOf('pushPull'));
    expect(r.flags.find((f) => f.type === 'pushPull')!.message).toBe('Push 16 sets vs pull 3 sets (5.3\u00d7)');
    expect(r.flags.find((f) => f.type === 'untrained' && f.muscle === 'lats')!.message).toBe('Lats: 0 sets this week');
    expect(r.flags.some((f) => f.type === 'onceAWeek' && f.muscle === 'chest')).toBe(true);
  });
  it('excludes sessions outside the window and active sessions', () => {
    const sessions = [finished('a', day(2), 'bench', sets(3)), finished('b', day(9), 'bench', sets(3), { status: 'active' })];
    expect(analyseSplit({ sessions, exercises, windowEnd: '2025-03-10', toLocalDate }).sessionCount).toBe(0);
  });
  it('feeds the dashboard card stats', () => {
    const stats = gymCardStats([finished('a', day(8), 'bench', sets(10))], exercises, '2025-03-10', toLocalDate);
    expect(stats).toMatchObject({ sessionsLast7: 1, last: { date: '2025-03-08', routineName: 'Empty session' } });
    expect(stats.lowOrUntrained).toBe(12);
    expect(elapsedLabel(0, 3_725_000)).toBe('1:02:05');
  });
});
describe('charts', () => {
  const toLocalDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  it('builds points per metric, marks PRs and filters by calendar months', () => {
    const a = finished('a', Date.UTC(2025, 0, 31, 12), 'bench', [done('a1', 60, 5, 1)]);
    const b = finished('b', Date.UTC(2025, 2, 28, 12), 'bench', [done('b1', 70, 5, 2), done('b2', 60, 10, 3)]);
    const marks = prMarksForExercise([a, b], 'bench');
    const pts = chartPoints('bench', [b, a], 'volume', marks, toLocalDate);
    expect(pts.map((p) => [p.date, p.value, p.marked])).toEqual([['2025-01-31', 300, false], ['2025-03-28', 950, true]]);
    expect(chartPoints('bench', [a, b], 'topWeight', marks, toLocalDate).map((p) => p.value)).toEqual([60, 70]);
    expect(inRange(pts, '2025-04-28', '1m').map((p) => p.date)).toEqual(['2025-03-28']);
    expect(inRange(pts, '2025-03-31', '3m')).toHaveLength(2);
    expect(inRange(pts, '2025-04-30', '1m')).toHaveLength(0);
    expect(inRange(pts, '2030-01-01', 'all')).toHaveLength(2);
  });
});
