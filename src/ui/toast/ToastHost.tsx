import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { undoService as appUndoService, UNDO_TOAST_MS, type UndoService } from '../../core/undo/undoService';
import { UPDATE_MESSAGES, useUpdateState } from '../../core/update/updateService';
import { useDrag } from '../gestures/useDrag';
import { useReducedMotion } from '../motion/useReducedMotion';
import { toast as appToast, type ToastStore } from './toastStore';

interface SwipeToastProps {
  kind?: 'info' | 'error';
  testId: string;
  onDismiss(): void;
  children: ReactNode;
}

/** A toast that a horizontal swipe dismisses (same drag and velocity rules as sheets). */
function SwipeToast({ kind = 'info', testId, onDismiss, children }: SwipeToastProps) {
  const reduced = useReducedMotion();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const released = useRef<(offset: number) => void>(() => undefined);
  const drag = useDrag<HTMLDivElement>({
    axis: 'x',
    direction: 'both',
    reducedMotion: reduced,
    onDismiss: (offset) => released.current(offset),
  });
  released.current = (offset) => drag.slideOut(offset < 0 ? -window.innerWidth : window.innerWidth, () => dismissRef.current());
  return (
    <div
      ref={drag.ref}
      data-testid={testId}
      className={`rounded-continuous px-4 py-3 shadow-lg ${kind === 'error' ? 'bg-danger text-accent-fg' : 'bg-fg text-bg'}`}
      style={{ touchAction: 'pan-y', animation: reduced ? 'pl-fade-in 120ms linear' : 'pl-route-in 200ms ease-out' }}
      {...drag.handlers}
    >
      <div className="flex items-center justify-between gap-3">{children}</div>
    </div>
  );
}

const toastButton = 'tap rounded-continuous px-3 font-semibold underline disabled:opacity-50';

function UndoToast({ undo }: { undo: UndoService }) {
  const state = useSyncExternalStore(undo.subscribe, undo.getState);
  useEffect(() => {
    if (state.status !== 'failed') return undefined;
    const timer = setTimeout(() => undo.dismiss(), UNDO_TOAST_MS);
    return () => clearTimeout(timer);
  }, [state, undo]);
  if (state.status === 'shown') {
    return (
      <SwipeToast testId="undo-toast" onDismiss={() => undo.dismiss()}>
        <span>{state.label}</span>
        <button type="button" className={toastButton} disabled={state.undoing} onClick={() => void undo.undo()}>
          Undo
        </button>
      </SwipeToast>
    );
  }
  if (state.status === 'failed') {
    return (
      <SwipeToast kind="error" testId="undo-failed" onDismiss={() => undo.dismiss()}>
        <span>{state.message}</span>
      </SwipeToast>
    );
  }
  return null;
}

function UpdateToast() {
  const update = useUpdateState();
  if (!update.visible) return null;
  return (
    <SwipeToast kind={update.notice ? 'error' : 'info'} testId="update-toast" onDismiss={update.dismiss}>
      <span>{update.notice ?? UPDATE_MESSAGES.available}</span>
      <button type="button" className={toastButton} onClick={() => void update.reload()}>
        {UPDATE_MESSAGES.reload}
      </button>
    </SwipeToast>
  );
}

function TransientToast({ store }: { store: ToastStore }) {
  const item = useSyncExternalStore(store.subscribe, store.getState);
  if (!item) return null;
  return (
    <SwipeToast key={item.id} kind={item.kind ?? 'info'} testId="toast" onDismiss={store.dismiss}>
      <span>{item.message}</span>
      {item.action ? (
        <button
          type="button"
          className={toastButton}
          onClick={() => {
            item.action?.run();
            store.dismiss();
          }}
        >
          {item.action.label}
        </button>
      ) : null}
    </SwipeToast>
  );
}

export interface ToastHostProps {
  undo?: UndoService;
  store?: ToastStore;
}

/** Outside the routed outlet, so toasts persist across navigation (R64.6). Sits above the tab bar. */
export function ToastHost({ undo = appUndoService, store = appToast }: ToastHostProps) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2">
        <UpdateToast />
        <UndoToast undo={undo} />
        <TransientToast store={store} />
      </div>
    </div>
  );
}
