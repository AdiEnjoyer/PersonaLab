import { liveQuery } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../../../core/db/db';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { enqueueWrite } from '../../../core/db/writeQueue';
import { newId } from '../../../core/ids';
import { captureSnapshot, recordDiffUndo } from '../../../core/undo/recordDiff';
import { undoService } from '../../../core/undo/undoService';
import { parseReps, parseWeight } from '../logic/entry';
import { finish, startEmpty, startFromRoutine } from '../logic/session';
import type { Routine, Session } from '../types';
import { adoptActive, flushActiveSession, getActiveSession, invalidateActive, loadActive, useActiveStore } from './activeStore';
import { GYM_TABLES } from './backup';
const table = () => db.table<Session>(GYM_TABLES.sessions);
const byStartDesc = (a: Session, b: Session) => b.startedAt - a.startedAt || (a.id < b.id ? 1 : -1);
export async function readFinishedSessions(): Promise<Session[]> {
  return (await table().where('status').equals('finished').toArray()).sort(byStartDesc);
}
/** Finished Sessions, newest first, live. Undefined while the first read is pending. */
export function useFinishedSessions(): Session[] | undefined {
  return useLiveQuery(readFinishedSessions, []);
}
/** One stored Session; `null` when missing; undefined while loading. */
export function useSession(id: string): Session | null | undefined {
  return useLiveQuery(async () => (await table().get(id)) ?? null, [id]);
}
/** The Active Session: the in-memory state when it is loaded and not empty, else the stored one (R20.7, R28.2). */
export function useActiveSession(): Session | null | undefined {
  const memory = useActiveStore();
  const stored = useLiveQuery(async () => (await table().where('status').equals('active').first()) ?? null, []);
  return memory ?? stored;
}
export type StartKind = { type: 'empty' } | { type: 'routine'; routineId: string };
export type StartResult = { status: 'started'; session: Session } | { status: 'conflict'; existing: Session };
let starting: Promise<StartResult> | undefined;
async function plan(kind: StartKind): Promise<Session> {
  const finished = await readFinishedSessions();
  const ctx = { now: Date.now(), newId };
  if (kind.type === 'empty') return startEmpty(ctx);
  const routine = await db.table<Routine>(GYM_TABLES.routines).get(kind.routineId);
  if (routine === undefined) throw new Error('The routine no longer exists.');
  return startFromRoutine(routine, finished, ctx);
}
/**
 * Creates the Active Session unless one exists (R18.7). Taps made while a start is running share its
 * result; the existence check and the add run in one read-write transaction, which IndexedDB serialises
 * across windows. A failed write leaves nothing behind (R18.10).
 */
export function startSession(kind: StartKind): Promise<StartResult> {
  if (starting !== undefined) return starting;
  starting = (async (): Promise<StartResult> => {
    await flushActiveSession();
    const session = await plan(kind);
    const result = await write([GYM_TABLES.sessions], async (): Promise<StartResult> => {
      const existing = await table().where('status').equals('active').first();
      if (existing !== undefined) return { status: 'conflict', existing };
      await table().add(stripUndefined(session));
      return { status: 'started', session };
    });
    if (result.status === 'started') adoptActive(result.session);
    return result;
  })().finally(() => {
    starting = undefined;
  });
  return starting;
}
const wrapUndo = (label: string, before: Awaited<ReturnType<typeof captureSnapshot>>, after: Awaited<ReturnType<typeof captureSnapshot>>) => {
  const inner = recordDiffUndo(label, before, after);
  undoService.push({
    label,
    undo: async () => {
      await inner.undo();
      invalidateActive();
    },
  });
};
/** Deletes the Active Session and starts the requested one in one transaction; Undo reverses both (R18.6). */
export async function discardAndStart(oldId: string, kind: StartKind): Promise<StartResult> {
  await flushActiveSession();
  const session = await plan(kind);
  const result = await write([GYM_TABLES.sessions], async () => {
    const keysBefore = { [GYM_TABLES.sessions]: [oldId, session.id] };
    const others = await table().where('status').equals('active').toArray();
    const other = others.find((s) => s.id !== oldId);
    if (other !== undefined) return { status: 'conflict' as const, existing: other };
    const before = await captureSnapshot([GYM_TABLES.sessions], keysBefore);
    await table().delete(oldId);
    await table().add(stripUndefined(session));
    const after = await captureSnapshot([GYM_TABLES.sessions], keysBefore);
    return { status: 'started' as const, session, before, after };
  });
  if (result.status === 'conflict') return result;
  adoptActive(result.session);
  wrapUndo('Session discarded', result.before, result.after);
  return { status: 'started', session: result.session };
}
/** Deletes the Active Session with all its Sets and offers Undo (R21.4, R22.4). */
export async function discardActive(): Promise<void> {
  await loadActive();
  await flushActiveSession();
  const current = getActiveSession();
  if (current === null || current === undefined) return;
  const keys = { [GYM_TABLES.sessions]: [current.id] };
  const { before, after } = await write([GYM_TABLES.sessions], async () => {
    const snapshotBefore = await captureSnapshot([GYM_TABLES.sessions], keys);
    await table().delete(current.id);
    return { before: snapshotBefore, after: await captureSnapshot([GYM_TABLES.sessions], keys) };
  });
  adoptActive(null);
  wrapUndo('Session discarded', before, after);
}
let finishing: Promise<Session> | undefined;
/**
 * Finishes the Active Session in one write that includes every unsaved change (R22.1). Repeated calls share
 * one result, so there is exactly one finish timestamp. On failure the Session stays Active unchanged.
 */
export function finishActive(at?: number): Promise<Session> {
  if (finishing !== undefined) return finishing;
  finishing = (async () => {
    await loadActive();
    const current = getActiveSession();
    if (current === null || current === undefined) throw new Error('There is no active session.');
    const done = finish(current, at ?? Date.now());
    await enqueueWrite(current.id, () =>
      write([GYM_TABLES.sessions], async () => {
        const stored = await table().get(current.id);
        if (stored === undefined || stored.status !== 'active') throw new Error('The session is no longer active.');
        await table().put(stripUndefined(done));
      }),
    );
    adoptActive(null);
    return done;
  })().finally(() => {
    finishing = undefined;
  });
  return finishing;
}
export type FinishedEdit = { ok: true } | { ok: false; reason: 'invalid' | 'missing' };
/** Edits the weight or reps of a Set of a Finished Session within the R19.1 ranges (R22.6). */
export async function editFinishedSet(sessionId: string, entryId: string, setId: string, field: 'weight' | 'reps', text: string): Promise<FinishedEdit> {
  const value = field === 'weight' ? parseWeight(text) : parseReps(text);
  if (value === null) return { ok: false, reason: 'invalid' };
  return enqueueResult(sessionId, async () => {
    const stored = await table().get(sessionId);
    const found = stored?.entries.find((e) => e.entryId === entryId)?.sets.some((x) => x.id === setId);
    if (stored === undefined || stored.status !== 'finished' || found !== true) return { ok: false, reason: 'missing' };
    const entries = stored.entries.map((e) => (e.entryId === entryId ? { ...e, sets: e.sets.map((x) => (x.id === setId ? { ...x, [field]: value, [field === 'weight' ? 'weightSource' : 'repsSource']: 'owner' as const } : x)) } : e));
    await table().put(stripUndefined({ ...stored, entries }));
    return { ok: true };
  });
}
/** Deletes a Set of a Finished Session and offers Undo (R22.6). */
export async function deleteFinishedSet(sessionId: string, entryId: string, setId: string): Promise<void> {
  const keys = { [GYM_TABLES.sessions]: [sessionId] };
  const result = await enqueueResult(sessionId, async () => {
    const before = await captureSnapshot([GYM_TABLES.sessions], keys);
    const stored = await table().get(sessionId);
    if (stored === undefined || stored.status !== 'finished') return undefined;
    const entries = stored.entries.map((e) => (e.entryId === entryId ? { ...e, sets: e.sets.filter((x) => x.id !== setId) } : e));
    await table().put(stripUndefined({ ...stored, entries }));
    return { before, after: await captureSnapshot([GYM_TABLES.sessions], keys) };
  });
  if (result !== undefined) undoService.push(recordDiffUndo('Set deleted', result.before, result.after));
}
function enqueueResult<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let out: T;
  return enqueueWrite(key, () =>
    write([GYM_TABLES.sessions], async () => {
      out = await fn();
    }),
  ).then(() => out);
}
/** Live value of `read`, with an error state and a retry (R28.6). */
export function useLiveRead<T>(read: () => Promise<T>): { value: T | undefined; failed: boolean; retry(): void } {
  const [state, setState] = useState<{ value: T | undefined; failed: boolean }>({ value: undefined, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const subscription = liveQuery(read).subscribe({
      next: (value) => setState({ value, failed: false }),
      error: () => setState({ value: undefined, failed: true }),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
