import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbWriteError } from '../../db/errors';
import { createUndoService, UNDO_TOAST_MS, type UndoAction, type UndoState } from '../undoService';

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

function action(label: string, impl: () => Promise<void> = async () => undefined): UndoAction & { calls: number } {
  const a = {
    label,
    calls: 0,
    async undo() {
      a.calls += 1;
      await impl();
    },
  };
  return a;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2025-03-07T09:05:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('undoService', () => {
  it('shows a pushed action for 6000 ms and then finalises it', async () => {
    const service = createUndoService();
    const a = action('Food entry deleted');
    service.push(a);
    expect(service.getState()).toEqual({
      status: 'shown',
      id: expect.any(Number),
      label: 'Food entry deleted',
      expiresAt: Date.now() + UNDO_TOAST_MS,
      undoing: false,
    });

    vi.advanceTimersByTime(UNDO_TOAST_MS - 1);
    expect(service.getState().status).toBe('shown');
    vi.advanceTimersByTime(1);
    expect(service.getState()).toEqual({ status: 'idle' });

    await service.undo();
    expect(a.calls).toBe(0);
  });

  it('acts on the first tap only and closes the toast on success', async () => {
    const service = createUndoService();
    const gate = deferred();
    const a = action('Routine deleted', () => gate.promise);
    service.push(a);

    const first = service.undo();
    expect(service.getState()).toMatchObject({ status: 'shown', undoing: true });
    const second = service.undo();
    gate.resolve();
    await Promise.all([first, second]);
    await service.undo();

    expect(a.calls).toBe(1);
    expect(service.getState()).toEqual({ status: 'idle' });
  });

  it('lets a running undo finish even when it outlasts the toast lifetime', async () => {
    const service = createUndoService();
    const gate = deferred();
    service.push(action('Session deleted', () => gate.promise));
    const running = service.undo();
    vi.advanceTimersByTime(UNDO_TOAST_MS * 2);
    expect(service.getState()).toMatchObject({ status: 'shown', undoing: true });
    service.dismiss();
    expect(service.getState()).toMatchObject({ status: 'shown', undoing: true });
    gate.resolve();
    await running;
    expect(service.getState()).toEqual({ status: 'idle' });
  });

  it('a new push finalises the previous action and restarts the timer', async () => {
    const service = createUndoService();
    const first = action('Set deleted');
    const second = action('Weight entry deleted');
    service.push(first);
    vi.advanceTimersByTime(4000);
    service.push(second);
    expect(service.getState()).toMatchObject({ status: 'shown', label: 'Weight entry deleted', undoing: false });

    // The first action's timer no longer applies: the second toast gets its full 6000 ms.
    vi.advanceTimersByTime(UNDO_TOAST_MS - 1);
    expect(service.getState()).toMatchObject({ status: 'shown', label: 'Weight entry deleted' });

    await service.undo();
    expect(first.calls).toBe(0);
    expect(second.calls).toBe(1);
  });

  it('dismiss finalises the action at once', async () => {
    const service = createUndoService();
    const a = action('Saved meal deleted');
    service.push(a);
    service.dismiss();
    expect(service.getState()).toEqual({ status: 'idle' });
    await service.undo();
    expect(a.calls).toBe(0);
  });

  it('a failing undo closes the toast and reports "Could not undo" with the reason', async () => {
    const service = createUndoService();
    service.push(action('Food entry deleted', async () => Promise.reject(new DbWriteError(quota(), true))));
    await service.undo();
    expect(service.getState()).toEqual({
      status: 'failed',
      id: expect.any(Number),
      label: 'Food entry deleted',
      reason: 'device storage is full',
      message: 'Could not undo: device storage is full.',
    });

    // A failed undo cannot be retried; dismiss clears the report.
    await service.undo();
    service.dismiss();
    expect(service.getState()).toEqual({ status: 'idle' });
  });

  it('maps a non-database failure to a short fixed reason, never the raw error text', async () => {
    const service = createUndoService();
    service.push(action('Repertoire reset', async () => Promise.reject(new Error('secret internal detail'))));
    await service.undo();
    const state = service.getState();
    expect(state.status).toBe('failed');
    expect(state.status === 'failed' && state.message).toBe('Could not undo: the local database could not be written.');
  });

  it('a push while an undo is running keeps the new toast when the old undo fails', async () => {
    const service = createUndoService();
    const gate = deferred();
    service.push(action('Set deleted', () => gate.promise));
    const running = service.undo();
    service.push(action('Routine deleted'));
    gate.reject(new Error('boom'));
    await running;
    expect(service.getState()).toMatchObject({ status: 'shown', label: 'Routine deleted', undoing: false });
  });

  it('notifies subscribers of every change until they unsubscribe', async () => {
    const service = createUndoService();
    const seen: UndoState['status'][] = [];
    const unsubscribe = service.subscribe((s) => seen.push(s.status));
    service.push(action('Exercise archived'));
    await service.undo();
    unsubscribe();
    service.push(action('Exercise archived'));
    expect(seen).toEqual(['shown', 'shown', 'idle']);
  });

  it('keeps the same state reference between changes', () => {
    const service = createUndoService();
    service.push(action('Session discarded'));
    expect(service.getState()).toBe(service.getState());
  });
});
