export interface Sample {
  /** Milliseconds. */
  t: number;
  /** Pixels. */
  v: number;
}

/** Velocity window and release limits (R68.3). */
export const VELOCITY_WINDOW_MS = 100;
export const RELEASE_SHARE = 0.25;
export const RELEASE_VELOCITY = 0.5;

/** Velocity in px/ms over the samples within the last `windowMs` before `now`; 0 with fewer than two. */
export function velocityOf(samples: readonly Sample[], now: number, windowMs = VELOCITY_WINDOW_MS): number {
  const recent = samples.filter((s) => now - s.t <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const dt = last.t - first.t;
  return dt <= 0 ? 0 : (last.v - first.v) / dt;
}

/** Whether a released drag dismisses: past `share` of the size, or faster than 0.5 px/ms. */
export function shouldRelease(offset: number, size: number, velocity: number, share = RELEASE_SHARE): boolean {
  return offset > share * size || velocity > RELEASE_VELOCITY;
}
