import { toDbWriteError } from '../db/errors';

/** How long an Undo_Toast stays visible, counted from the moment it appears (R64.1, R64.6). */
export const UNDO_TOAST_MS = 6000;

/** A destructive action that has been written and can be reverted once. */
export interface UndoAction {
  /** Names the action in the Undo_Toast, e.g. "Food entry deleted" (R64.1). */
  label: string;
  /** Reverts the action in one Local_Database transaction (R64.2). */
  undo(): Promise<void>;
}

export type UndoState =
  /** No Undo_Toast and no undo failure to report. */
  | { status: 'idle' }
  /** An Undo_Toast is visible; `undoing` is true after the first tap, which disables "Undo" (R64.2). */
  | { status: 'shown'; id: number; label: string; expiresAt: number; undoing: boolean }
  /** The Undo transaction failed: the toast is closed and an error Toast shows `message` (R64.7). */
  | { status: 'failed'; id: number; label: string; reason: string; message: string };

export type UndoListener = (state: UndoState) => void;

export interface UndoService {
  /** Finalises the current action (if any) and shows a new Undo_Toast for `durationMs` (R64.4). */
  push(action: UndoAction): void;
  /**
   * Runs the current action's undo. Acts on the first tap only; later taps, and taps after the toast has
   * closed, do nothing (R64.2). On failure the after-state stays, the toast closes and the state becomes
   * `failed` with "Could not undo: {reason}." (R64.7).
   */
  undo(): Promise<void>;
  /** Swipe away: finalises the shown action at once (R64.5), or clears a reported undo failure. */
  dismiss(): void;
  /** Calls `listener` with the new state after every change. Returns the unsubscribe function. */
  subscribe(listener: UndoListener): () => void;
  /** The current state (stable reference between changes, for `useSyncExternalStore`). */
  getState(): UndoState;
}

export interface UndoServiceOptions {
  /** Toast lifetime in ms; `UNDO_TOAST_MS` by default. */
  durationMs?: number;
  /** Clock for `expiresAt`; `Date.now` by default. */
  now?: () => number;
}

const IDLE: UndoState = { status: 'idle' };

/** The Toast text for a failed undo (R64.7, R3.5 wording). */
export function undoFailureMessage(reason: string): string {
  return `Could not undo: ${reason}.`;
}

/**
 * Creates an Undo service. Its timer and undo data live in memory outside React, so the toast survives
 * navigation and a reload finalises the action (R64.6).
 */
export function createUndoService(options: UndoServiceOptions = {}): UndoService {
  const durationMs = options.durationMs ?? UNDO_TOAST_MS;
  const now = options.now ?? (() => Date.now());

  let state: UndoState = IDLE;
  /** The action behind the shown toast; dropped (finalised) as soon as the toast closes. */
  let current: UndoAction | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let nextId = 1;
  const listeners = new Set<UndoListener>();

  const setState = (next: UndoState) => {
    state = next;
    for (const listener of [...listeners]) listener(next);
  };

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  /** Discards the undo data so the action can no longer be undone, and closes the toast. */
  const finalise = () => {
    stopTimer();
    current = null;
    setState(IDLE);
  };

  return {
    push(action) {
      stopTimer();
      const id = nextId++;
      current = action;
      timer = setTimeout(() => {
        if (state.status === 'shown' && state.id === id && !state.undoing) finalise();
      }, durationMs);
      setState({ status: 'shown', id, label: action.label, expiresAt: now() + durationMs, undoing: false });
    },

    async undo() {
      if (state.status !== 'shown' || state.undoing || current === null) return;
      const { id, label } = state;
      const action = current;
      // The first tap wins: the undo data is taken and the button disabled before any await.
      current = null;
      stopTimer();
      setState({ ...state, undoing: true });
      try {
        await action.undo();
        if (state.status === 'shown' && state.id === id) setState(IDLE);
      } catch (error) {
        const reason = toDbWriteError(error).reason;
        // A newer push replaced this toast while the undo ran; it keeps its own toast.
        if (state.status === 'shown' && state.id !== id) return;
        setState({ status: 'failed', id, label, reason, message: undoFailureMessage(reason) });
      }
    },

    dismiss() {
      if (state.status === 'shown' && state.undoing) return; // already committing; it closes when it settles
      if (state.status !== 'idle') finalise();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getState() {
      return state;
    },
  };
}

/** THE Undo service of the App; the ToastHost renders its state (R64). */
export const undoService: UndoService = createUndoService();
