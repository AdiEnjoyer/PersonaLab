import { useSyncExternalStore } from 'react';
import { db } from '../../../core/db/db';
import { toDbWriteError } from '../../../core/db/errors';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { enqueueWrite } from '../../../core/db/writeQueue';
import { toast } from '../../../ui/toast/toastStore';
import { AUTOSAVE_MAX_DELAY_MS } from '../constants';
import { restView } from '../logic/restTimer';
import type { Session } from '../types';
import { GYM_TABLES } from './backup';
/** Debounce of an autosave; the first pending change is written no later than AUTOSAVE_MAX_DELAY_MS (R21.1). */
const DEBOUNCE_MS = 250;
const table = () => db.table<Session>(GYM_TABLES.sessions);
/** `undefined` until loaded, `null` when no Session is Active. */
let state: Session | null | undefined;
let lastStored: Session | null = null;
let pendingSince: number | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();
let firstLoad = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const clearTimer = () => {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
};
export const getActiveSession = (): Session | null | undefined => state;
export function subscribeActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** The in-memory Active Session: `undefined` while loading, `null` when none. */
export function useActiveStore(): Session | null | undefined {
  return useSyncExternalStore(subscribeActive, getActiveSession);
}
async function doSave(): Promise<void> {
  const snapshot = state;
  if (snapshot === null || snapshot === undefined || pendingSince === undefined) return;
  pendingSince = undefined;
  try {
    let stale = false;
    await enqueueWrite(snapshot.id, () =>
      write([GYM_TABLES.sessions], async () => {
        const current = await table().get(snapshot.id);
        // Finished or deleted elsewhere: never bring it back.
        if (current === undefined || current.status !== 'active') {
          stale = true;
          return;
        }
        await table().put(stripUndefined(snapshot));
      }),
    );
    if (stale) {
      invalidateActive();
      return;
    }
    lastStored = snapshot;
  } catch (error) {
    if (state?.id === snapshot.id) {
      clearTimer();
      pendingSince = undefined;
      state = lastStored;
      emit();
    }
    toast.show({ message: `Not saved: ${toDbWriteError(error).reason}.`, kind: 'error' });
  }
}
const save = (): Promise<void> => (chain = chain.then(doSave));
/** Writes pending changes now and resolves when stored (R10.4, R21.1). */
export function flushActiveSession(): Promise<void> {
  clearTimer();
  return save();
}
function schedule(now: number): void {
  pendingSince ??= now;
  clearTimer();
  timer = setTimeout(() => void save(), Math.max(0, Math.min(DEBOUNCE_MS, pendingSince + AUTOSAVE_MAX_DELAY_MS - now)));
}
/**
 * Applies `fn` to the Active Session. The result gets `lastChangeAt = now` and is autosaved within 500 ms.
 * Returning the same object is a no-change.
 */
export function changeActive(fn: (s: Session) => Session, now = Date.now()): void {
  if (state === null || state === undefined) return;
  const next = fn(state);
  if (next === state) return;
  state = { ...next, lastChangeAt: now };
  emit();
  schedule(now);
}
/** Replaces the in-memory state with a Session that is already stored (or null). */
export function adoptActive(session: Session | null): void {
  clearTimer();
  pendingSince = undefined;
  state = session;
  lastStored = session;
  emit();
}
/** Forgets the in-memory state so the next load reads the database. */
export function invalidateActive(): void {
  clearTimer();
  pendingSince = undefined;
  state = undefined;
  lastStored = null;
  emit();
}
/** Loads the Active Session from the database (once, unless invalidated or `force` and nothing is pending). */
export async function loadActive(force = false): Promise<Session | null> {
  if (state !== undefined && !(force && pendingSince === undefined)) return state;
  const stored = (await table().where('status').equals('active').first()) ?? null;
  if (pendingSince !== undefined) return state ?? null;
  state = stored;
  lastStored = stored;
  const wasFirst = firstLoad;
  firstLoad = false;
  emit();
  // After a cold start an end time that already passed shows no alert and plays no sound (R21.2).
  if (wasFirst && stored?.restTimer !== undefined && restView(stored.restTimer, Date.now()).kind === 'alert') {
    changeActive((s) => ({ ...s, restTimer: { endAt: s.restTimer!.endAt, alertDismissed: true } }), stored.lastChangeAt);
  }
  return state ?? null;
}
/** Test helper: forget everything. */
export function resetActiveStore(): void {
  clearTimer();
  pendingSince = undefined;
  state = undefined;
  lastStored = null;
  chain = Promise.resolve();
  firstLoad = true;
  emit();
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushActiveSession();
  });
}
