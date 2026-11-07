import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { undoService } from '../../../../core/undo/undoService';
import { installWriteFailures, withFreshDb } from '../../../../test/helpers/db';
import type { CustomExercise, LibraryState, Routine, RoutineItem } from '../../types';
import { archiveExercise, createCustomExercise, restoreExercise, updateCustomExercise } from '../exercises';
import { loadLibrary, resetLibraryCache } from '../library';
import { downloadAllPhotos, downloadMessage } from '../photoDownload';
import { createRoutine, deleteRoutine, updateRoutine } from '../routines';

const failures = installWriteFailures(db);
const values = { name: 'Cable thing', primaryMuscles: ['chest' as const], secondaryMuscles: [], equipment: 'cable' as const };
const photo = (imageId = 'img1') => ({ imageId, image: { bytes: new Uint8Array([1, 2, 3]).buffer, mime: 'image/jpeg' as const, width: 4, height: 3, blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' } });
const item = (itemId: string, exerciseId: string): RoutineItem => ({ itemId, exerciseId, targetSets: 3, repMin: 8, repMax: 12 });

beforeEach(async () => {
  failures.clear();
  undoService.dismiss();
  await withFreshDb(async () => undefined);
});

async function routineWith(name: string, items: RoutineItem[]): Promise<Routine> {
  const r = await createRoutine(name, `key-${name}`);
  await updateRoutine(r.id, (x) => ({ ...x, items }));
  return (await db.table<Routine>('gym_routines').get(r.id))!;
}

describe('custom exercises', () => {
  it('creates one record per Idempotency_Key, with its photo', async () => {
    const a = await createCustomExercise(values, 'key-1', photo());
    const b = await createCustomExercise(values, 'key-1', photo());
    expect(b.id).toBe(a.id);
    expect(await db.table('gym_customExercises').count()).toBe(1);
    expect(await db.table('gym_images').count()).toBe(1);
    expect(a.photo).toMatchObject({ imageId: 'img1', width: 4, height: 3 });
  });

  it('leaves nothing behind when the write fails, and a retry with the same key works', async () => {
    failures.failNext('gym_customExercises', () => new DOMException('boom', 'AbortError'));
    await expect(createCustomExercise(values, 'key-2', photo('img2'))).rejects.toMatchObject({ name: 'DbWriteError' });
    expect(await db.table('gym_customExercises').count()).toBe(0);
    expect(await db.table('gym_images').count()).toBe(0);
    await createCustomExercise(values, 'key-2', photo('img2'));
    expect(await db.table('gym_customExercises').count()).toBe(1);
  });

  it('replaces and removes the photo on edit', async () => {
    const a = await createCustomExercise(values, 'key-3', photo('old'));
    await updateCustomExercise(a.id, { ...values, name: 'Renamed' }, photo('new'));
    expect((await db.table<CustomExercise>('gym_customExercises').get(a.id))!.photo?.imageId).toBe('new');
    expect((await db.table('gym_images').toArray()).map((i) => i.id)).toEqual(['new']);
    await updateCustomExercise(a.id, values, 'remove');
    expect((await db.table<CustomExercise>('gym_customExercises').get(a.id))!.photo).toBeUndefined();
    expect(await db.table('gym_images').count()).toBe(0);
  });
});

describe('archive, undo and restore', () => {
  it('removes routine items on archive, restores them on Undo at their original index', async () => {
    const ex = await createCustomExercise(values, 'k');
    const r1 = await routineWith('A', [item('1', 'lib'), item('2', ex.id), item('3', 'lib'), item('4', ex.id)]);
    const r2 = await routineWith('B', [item('5', 'lib')]);
    await archiveExercise({ id: ex.id, source: 'custom' });
    expect((await db.table<Routine>('gym_routines').get(r1.id))!.items.map((i) => i.itemId)).toEqual(['1', '3']);
    expect((await db.table<CustomExercise>('gym_customExercises').get(ex.id))!.archived).toBe(true);
    expect(undoService.getState().status).toBe('shown');
    await undoService.undo();
    expect((await db.table<Routine>('gym_routines').get(r1.id))!.items.map((i) => i.itemId)).toEqual(['1', '2', '3', '4']);
    expect((await db.table<CustomExercise>('gym_customExercises').get(ex.id))!.archived).toBe(false);
    expect((await db.table<Routine>('gym_routines').get(r2.id))!.items).toHaveLength(1);
  });

  it('archives a library exercise through libraryState; restore does not re-add items', async () => {
    const r = await routineWith('A', [item('1', 'Bench_Press')]);
    await archiveExercise({ id: 'Bench_Press', source: 'library' });
    expect(await db.table<LibraryState>('gym_libraryState').toArray()).toEqual([{ id: 'Bench_Press', archived: true }]);
    expect((await db.table<Routine>('gym_routines').get(r.id))!.items).toEqual([]);
    undoService.dismiss();
    await restoreExercise({ id: 'Bench_Press', source: 'library' });
    expect(await db.table('gym_libraryState').count()).toBe(0);
    expect((await db.table<Routine>('gym_routines').get(r.id))!.items).toEqual([]);
  });

  it('changes nothing and shows no Undo_Toast when the archive write fails', async () => {
    const ex = await createCustomExercise(values, 'k');
    const r = await routineWith('A', [item('1', ex.id)]);
    failures.failNext('gym_customExercises', () => new DOMException('boom', 'AbortError'));
    await expect(archiveExercise({ id: ex.id, source: 'custom' })).rejects.toMatchObject({ name: 'DbWriteError' });
    expect(undoService.getState().status).toBe('idle');
    expect((await db.table<Routine>('gym_routines').get(r.id))!.items).toHaveLength(1);
    expect((await db.table<CustomExercise>('gym_customExercises').get(ex.id))!.archived).toBe(false);
  });
});

describe('routines', () => {
  it('deletes with Undo', async () => {
    const r = await routineWith('A', [item('1', 'x')]);
    await deleteRoutine(r.id);
    expect(await db.table('gym_routines').count()).toBe(0);
    await undoService.undo();
    expect(await db.table<Routine>('gym_routines').get(r.id)).toEqual(r);
  });

  it('creates once per Idempotency_Key', async () => {
    const [a, b] = await Promise.all([createRoutine('Push', 'same'), createRoutine('Push', 'same')]);
    expect(a.id).toBe(b.id);
    expect(await db.table('gym_routines').count()).toBe(1);
  });

  it('applies queued edits in order to the stored record', async () => {
    const r = await createRoutine('Push', 'k');
    await Promise.all([updateRoutine(r.id, (x) => ({ ...x, name: 'One' })), updateRoutine(r.id, (x) => ({ ...x, items: [item('1', 'e')] }))]);
    expect(await db.table<Routine>('gym_routines').get(r.id)).toMatchObject({ name: 'One', items: [{ itemId: '1' }] });
  });
});

describe('library loading', () => {
  const response = (body: string, status = 200) => Promise.resolve(new Response(body, { status }));
  it('returns null for a missing file, non-JSON and invalid data', async () => {
    resetLibraryCache();
    expect(await loadLibrary(vi.fn(() => response('', 404)))).toBeNull();
    resetLibraryCache();
    expect(await loadLibrary(vi.fn(() => response('<html></html>')))).toBeNull();
    resetLibraryCache();
    expect(await loadLibrary(vi.fn(() => response('[{"id":1}]')))).toBeNull();
    resetLibraryCache();
    expect(await loadLibrary(vi.fn(() => Promise.reject(new TypeError('offline'))))).toBeNull();
  });
  it('parses a valid file once', async () => {
    resetLibraryCache();
    const file = [{ id: 'a', name: 'A', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'cable', category: 'strength', level: 'beginner', instructions: [], images: [] }];
    const fetchFn = vi.fn(() => response(JSON.stringify(file)));
    expect(await loadLibrary(fetchFn)).toHaveLength(1);
    await loadLibrary(fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    resetLibraryCache();
  });
});

describe('photo download', () => {
  const urls = ['a', 'b', 'c', 'd', 'e'];
  function fakeCache(initial: string[]) {
    const store = new Set(initial);
    return {
      store,
      match: (u: string) => Promise.resolve(store.has(u) ? new Response('x') : undefined),
      put: (u: string) => {
        store.add(u);
        return Promise.resolve();
      },
    };
  }
  it('fetches only missing images and reports N of M', async () => {
    const cache = fakeCache(['a', 'b']);
    const fetchImage = vi.fn(() => Promise.resolve(new Response('img', { status: 200 })));
    const progress: Array<[number, number]> = [];
    const result = await downloadAllPhotos(urls, { cache, fetchImage }, (n, m) => progress.push([n, m]));
    expect(fetchImage).toHaveBeenCalledTimes(3);
    expect(progress[0]).toEqual([2, 5]);
    expect(progress.at(-1)).toEqual([5, 5]);
    expect(result).toEqual({ cached: 5, total: 5, storageFull: false });
    expect(downloadMessage(result)).toBe('All exercise photos are available offline.');
  });
  it('keeps going after a failure and stops after a quota error', async () => {
    const cache = fakeCache([]);
    let n = 0;
    const fetchImage = vi.fn(() => {
      n += 1;
      if (n === 1) return Promise.reject(new TypeError('offline'));
      return Promise.resolve(new Response('img', { status: n === 2 ? 404 : 200 }));
    });
    const partial = await downloadAllPhotos(urls, { cache, fetchImage }, () => undefined);
    expect(partial.cached).toBe(3);
    expect(downloadMessage(partial)).toContain('3 of 5');

    const full = fakeCache([]);
    full.put = () => Promise.reject(new DOMException('full', 'QuotaExceededError'));
    const quota = await downloadAllPhotos(urls, { cache: full, fetchImage: () => Promise.resolve(new Response('i')) }, () => undefined);
    expect(quota.storageFull).toBe(true);
    expect(quota.cached).toBe(0);
    expect(downloadMessage(quota)).toContain('storage is full');
  });
});
