import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { undoService } from '../../../../core/undo/undoService';
import { installWriteFailures, withFreshDb } from '../../../../test/helpers/db';
import { editSetField, completeSet } from '../../logic/session';
import type { Routine, Session } from '../../types';
import { changeActive, flushActiveSession, getActiveSession, invalidateActive, loadActive, resetActiveStore } from '../activeStore';
import { createRoutine, updateRoutine } from '../routines';
import { deleteFinishedSet, discardActive, discardAndStart, editFinishedSet, finishActive, readFinishedSessions, startSession } from '../sessions';
import { listFinishedSessions } from '../trainingLog';
const failures = installWriteFailures(db);
const stored = () => db.table<Session>('gym_sessions').toArray();
beforeEach(async () => {
  failures.clear();
  undoService.dismiss();
  resetActiveStore();
  await withFreshDb(async () => undefined);
});
async function routine(): Promise<Routine> {
  const r = await createRoutine('Push', 'k1');
  await updateRoutine(r.id, (x) => ({ ...x, items: [{ itemId: 'i1', exerciseId: 'bench', targetSets: 2, repMin: 8, repMax: 12 }] }));
  return (await db.table<Routine>('gym_routines').get(r.id))!;
}
describe('starting sessions', () => {
  it('keeps at most one active session, even with several taps at once', async () => {
    const results = await Promise.all([startSession({ type: 'empty' }), startSession({ type: 'empty' }), startSession({ type: 'empty' })]);
    expect(results.every((r) => r.status === 'started')).toBe(true);
    expect(await stored()).toHaveLength(1);
    const again = await startSession({ type: 'empty' });
    expect(again.status).toBe('conflict');
    expect(await stored()).toHaveLength(1);
  });
  it('starts from a routine with its drafts', async () => {
    const r = await routine();
    const result = await startSession({ type: 'routine', routineId: r.id });
    expect(result.status === 'started' && result.session.entries[0]!.sets).toHaveLength(2);
    expect((await stored())[0]).toMatchObject({ routineName: 'Push', status: 'active' });
  });
  it('leaves nothing behind when the write fails', async () => {
    failures.failNext('gym_sessions', () => new DOMException('boom', 'AbortError'));
    await expect(startSession({ type: 'empty' })).rejects.toMatchObject({ name: 'DbWriteError' });
    expect(await stored()).toHaveLength(0);
  });
  it('discards and starts in one step, and Undo brings the old session back', async () => {
    const first = await startSession({ type: 'empty' });
    if (first.status !== 'started') throw new Error('expected start');
    const second = await discardAndStart(first.session.id, { type: 'empty' });
    expect(second.status).toBe('started');
    const ids = (await stored()).map((s) => s.id);
    expect(ids).toEqual([second.status === 'started' ? second.session.id : '']);
    await undoService.undo();
    expect((await stored()).map((s) => s.id)).toEqual([first.session.id]);
  });
});
describe('autosave and finishing', () => {
  it('commits changes within 500 ms and reloads equal to the in-memory state', async () => {
    const r = await routine();
    await startSession({ type: 'routine', routineId: r.id });
    const t0 = Date.now();
    const s = getActiveSession()!;
    const entry = s.entries[0]!;
    changeActive((x) => editSetField(x, entry.entryId, entry.sets[0]!.id, 'weight', '60'), t0);
    changeActive((x) => {
      const done = completeSet(x, entry.entryId, entry.sets[0]!.id, t0 + 100, 90);
      return done.ok ? done.session : x;
    }, t0 + 100);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect((await stored())[0]!.lastChangeAt).toBe(t0 + 100);
    await flushActiveSession();
    const memory = getActiveSession()!;
    invalidateActive();
    const reloaded = await loadActive();
    expect(reloaded).toEqual(memory);
    expect(reloaded!.lastChangeAt).toBe(t0 + 100);
    expect(reloaded!.restTimer).toEqual({ endAt: t0 + 100 + 90_000 });
  });
  it('finishes once with only the completed sets, and exposes it through the training log', async () => {
    const r = await routine();
    await startSession({ type: 'routine', routineId: r.id });
    const entry = getActiveSession()!.entries[0]!;
    changeActive((x) => editSetField(x, entry.entryId, entry.sets[0]!.id, 'weight', '60'));
    changeActive((x) => {
      const done = completeSet(x, entry.entryId, entry.sets[0]!.id, 2000, 90);
      return done.ok ? done.session : x;
    });
    const [a, b] = await Promise.all([finishActive(5000), finishActive(6000)]);
    expect(b).toBe(a);
    const [row] = await stored();
    expect(row).toMatchObject({ status: 'finished', finishedAt: 5000 });
    expect(row!.entries[0]!.sets).toHaveLength(1);
    expect(getActiveSession()).toBeNull();
    expect(await listFinishedSessions()).toEqual([{ startedAt: row!.startedAt, finishedAt: 5000 }]);
  });
  it('keeps the session active when finishing fails', async () => {
    await startSession({ type: 'empty' });
    failures.failNext('gym_sessions', () => new DOMException('boom', 'AbortError'));
    await expect(finishActive()).rejects.toMatchObject({ name: 'DbWriteError' });
    expect((await stored())[0]!.status).toBe('active');
    expect(getActiveSession()).not.toBeNull();
  });
  it('discards with Undo', async () => {
    await startSession({ type: 'empty' });
    await discardActive();
    expect(await stored()).toHaveLength(0);
    await undoService.undo();
    expect(await stored()).toHaveLength(1);
  });
});
describe('finished session edits', () => {
  it('validates edits and deletes sets with Undo', async () => {
    const r = await routine();
    await startSession({ type: 'routine', routineId: r.id });
    const entry = getActiveSession()!.entries[0]!;
    changeActive((x) => editSetField(x, entry.entryId, entry.sets[0]!.id, 'weight', '60'));
    changeActive((x) => {
      const done = completeSet(x, entry.entryId, entry.sets[0]!.id, 2000, 90);
      return done.ok ? done.session : x;
    });
    const done = await finishActive(5000);
    const setId = done.entries[0]!.sets[0]!.id;
    expect(await editFinishedSet(done.id, done.entries[0]!.entryId, setId, 'weight', '1001')).toEqual({ ok: false, reason: 'invalid' });
    expect(await editFinishedSet(done.id, done.entries[0]!.entryId, setId, 'weight', '62,5')).toEqual({ ok: true });
    expect((await readFinishedSessions())[0]!.entries[0]!.sets[0]!.weight).toBe(62.5);
    await deleteFinishedSet(done.id, done.entries[0]!.entryId, setId);
    expect((await readFinishedSessions())[0]!.entries[0]!.sets).toHaveLength(0);
    await undoService.undo();
    expect((await readFinishedSessions())[0]!.entries[0]!.sets).toHaveLength(1);
  });
});
