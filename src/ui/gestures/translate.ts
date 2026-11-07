/** The current translation of `el` from its computed transform (follows a running animation). */
export function currentTranslate(el: HTMLElement, axis: 'x' | 'y'): number {
  const transform = getComputedStyle(el).transform;
  const match = /matrix\(([^)]+)\)/.exec(transform);
  if (!match) return 0;
  const parts = match[1]!.split(',').map((p) => Number.parseFloat(p));
  return (axis === 'x' ? parts[4] : parts[5]) ?? 0;
}

/**
 * Moves `el` to `to` px along `axis`. Uses the Web Animations API when available, so a later pointerdown can
 * interrupt it by reading the computed transform; calls `done` when finished.
 */
export function animateTranslate(
  el: HTMLElement,
  axis: 'x' | 'y',
  to: number,
  durationMs: number,
  done?: () => void,
): void {
  const from = currentTranslate(el, axis);
  const css = (v: number) => (axis === 'x' ? `translateX(${v}px)` : `translateY(${v}px)`);
  const finish = () => {
    el.style.transform = css(to);
    done?.();
  };
  if (durationMs <= 0 || typeof el.animate !== 'function') {
    finish();
    return;
  }
  el.style.transform = css(from);
  const animation = el.animate([{ transform: css(from) }, { transform: css(to) }], {
    duration: durationMs,
    easing: 'ease-out',
    fill: 'forwards',
  });
  animation.onfinish = () => {
    animation.cancel();
    finish();
  };
}

/** Stops running animations on `el` and freezes it at its current translation. */
export function interrupt(el: HTMLElement, axis: 'x' | 'y'): number {
  const value = currentTranslate(el, axis);
  if (typeof el.getAnimations === 'function') for (const a of el.getAnimations()) a.cancel();
  el.style.transform = axis === 'x' ? `translateX(${value}px)` : `translateY(${value}px)`;
  return value;
}
