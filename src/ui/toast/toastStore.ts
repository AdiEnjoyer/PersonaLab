export interface ToastInput {
  message: string;
  kind?: 'info' | 'error';
  action?: { label: string; run(): void };
  durationMs?: number | 'persistent';
}

export interface ToastItem extends ToastInput {
  id: number;
}

const DEFAULT_MS = 4000;
const ERROR_MS = 6000;

type Listener = () => void;

/** One transient message at a time: a new message replaces the current one. */
export function createToastStore() {
  let current: ToastItem | null = null;
  let nextId = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const dismiss = (): void => {
    stop();
    if (current !== null) {
      current = null;
      emit();
    }
  };
  const show = (input: ToastInput): number => {
    stop();
    const item: ToastItem = { ...input, id: nextId++ };
    current = item;
    const ms = input.durationMs ?? (input.kind === 'error' ? ERROR_MS : DEFAULT_MS);
    if (ms !== 'persistent') {
      timer = setTimeout(() => {
        if (current?.id === item.id) dismiss();
      }, ms);
    }
    emit();
    return item.id;
  };
  return {
    show,
    dismiss,
    getState: (): ToastItem | null => current,
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ToastStore = ReturnType<typeof createToastStore>;

/** THE transient-message store of the App; `ToastHost` renders it. */
export const toast: ToastStore = createToastStore();
