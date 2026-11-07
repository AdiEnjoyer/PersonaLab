import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, type NavigateOptions } from 'react-router';
import { prefersReducedMotion } from '../motion/useReducedMotion';

interface ViewTransitionLike {
  finished: Promise<unknown>;
  skipTransition(): void;
}
type StartViewTransition = (update: () => void | Promise<void>) => ViewTransitionLike;

let running: ViewTransitionLike | null = null;

/**
 * Runs `update` inside `document.startViewTransition` when the browser has it and motion is allowed;
 * otherwise runs it plainly. A running transition is skipped first (R67.5); a failing transition never
 * blocks the navigation (R67.7).
 */
export function runWithViewTransition(update: () => void, reducedMotion: boolean = prefersReducedMotion()): void {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
  if (typeof start !== 'function' || reducedMotion) {
    update();
    return;
  }
  running?.skipTransition();
  let applied = false;
  const apply = () => {
    applied = true;
    flushSync(update);
  };
  try {
    const transition = start.call(document, apply);
    running = transition;
    transition.finished
      .catch(() => undefined)
      .finally(() => {
        if (running === transition) running = null;
      });
  } catch {
    if (!applied) update();
  }
}

/** `navigate` that animates through a view transition when possible (R67.1). */
export function useAppNavigate(): (to: string, options?: NavigateOptions) => void {
  const navigate = useNavigate();
  return useCallback(
    (to, options) => {
      runWithViewTransition(() => {
        void navigate(to, options);
      });
    },
    [navigate],
  );
}
