import { round } from '../math/round';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Clock text for a whole number of seconds (R28.2, R45.6):
 * `M:SS` below 3600 s, `H:MM:SS` from 3600 s.
 *
 * Fractional input is truncated to whole seconds; negative or non-finite
 * input is shown as `0:00`. Callers that need another rounding (the rest
 * timer rounds up) apply it before calling.
 */
export function formatClock(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const ss = s % 60;
  if (s < 3600) return `${Math.floor(s / 60)}:${pad2(ss)}`;
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return `${h}:${pad2(mm)}:${pad2(ss)}`;
}

/**
 * Duration in whole minutes, `round(ms / 60000)` half away from zero:
 * `"45 min"` below one hour, `"1 h 05 min"` from one hour.
 * Negative or non-finite input is shown as `"0 min"`.
 */
export function formatDurationMinutes(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? round(ms / 60_000) : 0;
  const h = Math.floor(total / 60);
  const min = total % 60;
  return h === 0 ? `${min} min` : `${h} h ${pad2(min)} min`;
}
