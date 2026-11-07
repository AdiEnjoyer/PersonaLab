import { LIMITS, RESUME_STALE_MS } from '../constants';
import type { Routine, Session, SessionEntry, SetRecord } from '../types';
import { canComplete, parseReps, parseWeight } from './entry';
import { isCompletedSet, type CompletedSet } from './metrics';
import { prefillFor, referenceSets } from './prefill';
import { minus15, plus15, startRest } from './restTimer';
/** Pure Session operations (R18 to R22). Every function returns a new Session and never mutates its input. */
export interface SessionCtx {
  now: number;
  newId(): string;
}
function draftSet(n: number, ref: readonly CompletedSet[] | undefined, repMin: number | undefined, ctx: SessionCtx): SetRecord {
  const fill = prefillFor(n, ref, repMin);
  return {
    id: ctx.newId(),
    idemKey: ctx.newId(),
    ...(fill.weight === undefined ? {} : { weight: fill.weight }),
    ...(fill.reps === undefined ? {} : { reps: fill.reps }),
    weightSource: fill.weight === undefined ? 'owner' : 'prefill',
    repsSource: fill.reps === undefined ? 'owner' : 'prefill',
    completed: false,
  };
}
function draftSets(count: number, exerciseId: string, history: readonly Session[], repMin: number | undefined, ctx: SessionCtx): SetRecord[] {
  const ref = referenceSets(exerciseId, history);
  return Array.from({ length: count }, (_, i) => draftSet(i + 1, ref, repMin, ctx));
}
const base = (ctx: SessionCtx): Session => ({ id: ctx.newId(), status: 'active', startedAt: ctx.now, lastChangeAt: ctx.now, entries: [] });
/** One entry per Routine_Item, in order, with targetSets pre-filled drafts (R18.1, R18.5). */
export function startFromRoutine(routine: Routine, history: readonly Session[], ctx: SessionCtx): Session {
  const entries: SessionEntry[] = routine.items.map((item) => ({
    entryId: ctx.newId(),
    exerciseId: item.exerciseId,
    routineItemId: item.itemId,
    repMin: item.repMin,
    repMax: item.repMax,
    ...(item.restSec === undefined ? {} : { restSec: item.restSec }),
    sets: draftSets(item.targetSets, item.exerciseId, history, item.repMin, ctx),
  }));
  return { ...base(ctx), routineId: routine.id, routineName: routine.name, entries };
}
export const startEmpty = (ctx: SessionCtx): Session => base(ctx);
const mapEntry = (s: Session, entryId: string, change: (e: SessionEntry) => SessionEntry): Session => ({
  ...s,
  entries: s.entries.map((e) => (e.entryId === entryId ? change(e) : e)),
});
/** Appends new entries (one draft each) or one more draft on an existing entry (R18.3). */
export function addExercises(s: Session, exerciseIds: readonly string[], history: readonly Session[], ctx: SessionCtx): Session {
  let next = s;
  for (const exerciseId of [...new Set(exerciseIds)]) {
    const existing = next.entries.find((e) => e.exerciseId === exerciseId);
    if (existing === undefined) {
      next = { ...next, entries: [...next.entries, { entryId: ctx.newId(), exerciseId, sets: draftSets(1, exerciseId, history, undefined, ctx) }] };
    } else {
      next = addSet(next, existing.entryId, history, ctx);
    }
  }
  return next;
}
export const canAddSet = (e: SessionEntry): boolean => e.sets.length < LIMITS.SETS_PER_EXERCISE;
/** Appends one draft; unchanged at 20 sets (R18.4). */
export function addSet(s: Session, entryId: string, history: readonly Session[], ctx: SessionCtx): Session {
  return mapEntry(s, entryId, (e) => {
    if (!canAddSet(e)) return e;
    const n = e.sets.length + 1;
    const ref = referenceSets(e.exerciseId, history);
    const repMin = e.routineItemId === undefined ? undefined : e.repMin;
    return { ...e, sets: [...e.sets, draftSet(n, ref, repMin, ctx)] };
  });
}
export type RemovedSet = { kind: 'set'; entryId: string; index: number; set: SetRecord };
export type RemovedEntry = { kind: 'entry'; index: number; entry: SessionEntry };
export type Removed = RemovedSet | RemovedEntry;
export function removeSet(s: Session, entryId: string, setId: string): { session: Session; undo: RemovedSet } | undefined {
  const entry = s.entries.find((e) => e.entryId === entryId);
  const index = entry?.sets.findIndex((x) => x.id === setId) ?? -1;
  if (entry === undefined || index < 0) return undefined;
  const set = entry.sets[index]!;
  return { session: mapEntry(s, entryId, (e) => ({ ...e, sets: e.sets.filter((x) => x.id !== setId) })), undo: { kind: 'set', entryId, index, set } };
}
export function removeEntry(s: Session, entryId: string): { session: Session; undo: RemovedEntry } | undefined {
  const index = s.entries.findIndex((e) => e.entryId === entryId);
  if (index < 0) return undefined;
  return { session: { ...s, entries: s.entries.filter((e) => e.entryId !== entryId) }, undo: { kind: 'entry', index, entry: s.entries[index]! } };
}
/** Puts a removed Set or Exercise back at its original position (R18.8). */
export function restoreRemoved(s: Session, removed: Removed): Session {
  if (removed.kind === 'entry') {
    if (s.entries.some((e) => e.entryId === removed.entry.entryId)) return s;
    const entries = [...s.entries];
    entries.splice(Math.min(removed.index, entries.length), 0, removed.entry);
    return { ...s, entries };
  }
  return mapEntry(s, removed.entryId, (e) => {
    if (e.sets.some((x) => x.id === removed.set.id)) return e;
    const sets = [...e.sets];
    sets.splice(Math.min(removed.index, sets.length), 0, removed.set);
    return { ...e, sets };
  });
}
/** Moves the entry at `from` to `to`; the others keep their relative order (R18.9). */
export function moveEntry(s: Session, from: number, to: number): Session {
  if (from === to || from < 0 || to < 0 || from >= s.entries.length || to >= s.entries.length) return s;
  const entries = [...s.entries];
  const [moved] = entries.splice(from, 1);
  entries.splice(to, 0, moved!);
  return { ...s, entries };
}
const mapSet = (s: Session, entryId: string, setId: string, change: (x: SetRecord) => SetRecord): Session =>
  mapEntry(s, entryId, (e) => ({ ...e, sets: e.sets.map((x) => (x.id === setId ? change(x) : x)) }));
const withoutCompletion = (x: SetRecord): SetRecord => {
  const { completedAt: _completedAt, ...rest } = x;
  return { ...rest, completed: false };
};
/**
 * Applies typed text to a field (R19.1, R19.9). Empty text clears the value; invalid text is not stored.
 * A completed Set that no longer can be completed becomes a draft.
 */
export function editSetField(s: Session, entryId: string, setId: string, field: 'weight' | 'reps', text: string): Session {
  return mapSet(s, entryId, setId, (x) => {
    const empty = text.trim() === '';
    const parsed = empty ? undefined : field === 'weight' ? parseWeight(text) : parseReps(text);
    if (!empty && parsed === null) return x;
    const { [field]: _old, ...rest } = x;
    const sourceKey = field === 'weight' ? 'weightSource' : 'repsSource';
    let next: SetRecord = { ...rest, ...(parsed === undefined || parsed === null ? {} : { [field]: parsed }), [sourceKey]: 'owner' } as SetRecord;
    if (next.completed && !canComplete(next).ok) next = withoutCompletion(next);
    return next;
  });
}
export const isFieldTextValid = (field: 'weight' | 'reps', text: string): boolean =>
  text.trim() === '' || (field === 'weight' ? parseWeight(text) : parseReps(text)) !== null;
export type CompleteResult = { ok: true; session: Session } | { ok: false; invalid: Array<'weight' | 'reps'> };
/** Completes a Set at `now` and starts the rest countdown (R19.7, R19.8, R19.10, R20.1). */
export function completeSet(s: Session, entryId: string, setId: string, now: number, restSec: number): CompleteResult {
  const set = s.entries.find((e) => e.entryId === entryId)?.sets.find((x) => x.id === setId);
  if (set === undefined) return { ok: false, invalid: [] };
  const check = canComplete(set);
  if (!check.ok) return check;
  const done = mapSet(s, entryId, setId, (x) => ({ ...x, completed: true, completedAt: now, weightSource: 'owner', repsSource: 'owner' }));
  return { ok: true, session: { ...done, restTimer: startRest(now, restSec) } };
}
export const uncompleteSet = (s: Session, entryId: string, setId: string): Session => mapSet(s, entryId, setId, withoutCompletion);
/** Rest time of an entry: its Routine_Item's, else the default (R20.1). */
export const restSecFor = (e: SessionEntry, defaultRestSec: number): number => e.restSec ?? defaultRestSec;
export type RestAction = 'minus15' | 'plus15' | 'skip' | 'dismiss';
/** Rest timer actions (R20.4, R20.5). */
export function adjustRest(s: Session, action: RestAction, now: number): Session {
  const timer = s.restTimer;
  if (timer === undefined) return s;
  const { restTimer: _timer, ...rest } = s;
  if (action === 'skip') return rest;
  if (action === 'dismiss') return { ...rest, restTimer: { endAt: timer.endAt, alertDismissed: true } };
  if (action === 'plus15') return { ...rest, restTimer: plus15(timer.endAt, now) };
  const next = minus15(timer.endAt, now);
  return { ...rest, restTimer: next === 'ended' ? { endAt: now } : next };
}
/** Number of Completed_Sets and of other Sets (R22.3, R22.4). */
export function finishPlan(s: Session): { incomplete: number; completed: number } {
  let completed = 0;
  let total = 0;
  for (const e of s.entries) {
    for (const x of e.sets) {
      total += 1;
      if (isCompletedSet(x)) completed += 1;
    }
  }
  return { incomplete: total - completed, completed };
}
/** Finishes: keeps exactly the Completed_Sets, drops empty entries and the timer (R22.1, R22.3, R20.9). */
export function finish(s: Session, at: number): Session {
  const entries = s.entries.map((e) => ({ ...e, sets: e.sets.filter(isCompletedSet) })).filter((e) => e.sets.length > 0);
  const { restTimer: _timer, ...rest } = s;
  return { ...rest, status: 'finished', finishedAt: at, lastChangeAt: at, entries };
}
/** Latest completion time among Completed_Sets (R21.5). */
export function lastCompletionTime(s: Session): number | undefined {
  let last: number | undefined;
  for (const e of s.entries) for (const x of e.sets) if (isCompletedSet(x) && x.completedAt !== undefined && (last === undefined || x.completedAt > last)) last = x.completedAt;
  return last;
}
export type ResumeDecision = 'resume' | 'stale-with-finish' | 'stale-no-finish';
/** What the start-up prompt offers (R21.2, R21.4, R21.6). */
export function resumeDecision(s: Session, now: number): ResumeDecision {
  if (now - s.lastChangeAt <= RESUME_STALE_MS) return 'resume';
  return lastCompletionTime(s) === undefined ? 'stale-no-finish' : 'stale-with-finish';
}
export const completedSetCount = (s: Session): number => finishPlan(s).completed;
