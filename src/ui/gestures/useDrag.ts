import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { shouldRelease, velocityOf, type Sample } from './velocity';
import { animateTranslate, interrupt } from './translate';

export interface UseDragOptions {
  axis: 'x' | 'y';
  /** `positive` only follows movement down/right (sheets); `both` follows either way (toasts). */
  direction: 'positive' | 'both';
  /** Called when the release rule says dismiss, with the final offset. */
  onDismiss(offset: number): void;
  reducedMotion: boolean;
}

export interface UseDrag<T extends HTMLElement> {
  ref: RefObject<T | null>;
  handlers: {
    onPointerDown(e: ReactPointerEvent): void;
    onPointerMove(e: ReactPointerEvent): void;
    onPointerUp(e: ReactPointerEvent): void;
    onPointerCancel(e: ReactPointerEvent): void;
  };
  snapBack(): void;
  slideOut(distance: number, done: () => void): void;
}

const SNAP_MS = 200;
const OUT_MS = 180;

/** True when a scrollable ancestor of `target` (below `root`) is scrolled, so the drag must scroll it first (R68.2). */
function scrolledInside(target: EventTarget | null, root: HTMLElement): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== root) {
    if (node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return root.scrollTop > 0;
}

/**
 * Pointer-event drag of one element along one axis with a velocity-based release (R68). A new pointerdown
 * interrupts a running animation and continues from its current position (R68.5, R68.8).
 */
export function useDrag<T extends HTMLElement>({ axis, direction, onDismiss, reducedMotion }: UseDragOptions): UseDrag<T> {
  const ref = useRef<T | null>(null);
  const state = useRef<{ start: number; base: number; offset: number; samples: Sample[]; moved: boolean } | null>(null);
  const coord = (e: ReactPointerEvent) => (axis === 'y' ? e.clientY : e.clientX);
  const now = () => performance.now();

  const snapBack = useCallback(() => {
    if (ref.current) animateTranslate(ref.current, axis, 0, reducedMotion ? 0 : SNAP_MS);
  }, [axis, reducedMotion]);

  const slideOut = useCallback(
    (distance: number, done: () => void) => {
      if (ref.current) animateTranslate(ref.current, axis, distance, reducedMotion ? 0 : OUT_MS, done);
      else done();
    },
    [axis, reducedMotion],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const el = ref.current;
      if (!el) return;
      if (axis === 'y' && scrolledInside(e.target, el)) return;
      const base = interrupt(el, axis);
      state.current = { start: coord(e), base, offset: base, samples: [{ t: now(), v: base }], moved: false };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axis],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const el = ref.current;
      const s = state.current;
      if (!el || !s) return;
      const raw = s.base + coord(e) - s.start;
      const offset = direction === 'positive' ? Math.max(0, raw) : raw;
      if (!s.moved && offset === 0) return;
      if (!s.moved) {
        s.moved = true;
        el.setPointerCapture?.(e.pointerId);
      }
      s.offset = offset;
      s.samples.push({ t: now(), v: offset });
      el.style.transform = axis === 'y' ? `translateY(${offset}px)` : `translateX(${offset}px)`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axis, direction],
  );

  const finish = useCallback(
    (cancelled: boolean) => {
      const el = ref.current;
      const s = state.current;
      state.current = null;
      if (!el || !s || !s.moved) return;
      const rect = el.getBoundingClientRect();
      const size = (axis === 'y' ? rect.height : rect.width) || 1;
      const v = velocityOf(s.samples, now());
      const velocity = direction === 'both' ? Math.abs(v) : v;
      if (!cancelled && shouldRelease(Math.abs(s.offset), size, velocity)) onDismiss(s.offset);
      else snapBack();
    },
    [axis, direction, onDismiss, snapBack],
  );

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: () => finish(false),
      onPointerCancel: () => finish(true),
    },
    snapBack,
    slideOut,
  };
}
