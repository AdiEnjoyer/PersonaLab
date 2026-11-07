import { round } from '../../../core/math/round';

export type RingState =
  | { kind: 'no-target'; consumed: number }
  | { kind: 'ok'; fraction: number; consumed: number; target: number; remaining: number }
  | { kind: 'over'; fraction: 1; consumed: number; target: number; over: number };

/**
 * Ring state of a daily total against a target (R32.1 to R32.3, R32.6). The fill fraction uses the unrounded
 * values; "over", the amounts and the remaining amount use the rounded ones, and remaining is never negative.
 */
export function ringState(total: number, target: number | undefined): RingState {
  const consumed = round(total);
  if (target === undefined || !Number.isFinite(target) || target <= 0) return { kind: 'no-target', consumed };
  const t = round(target);
  if (consumed > t) return { kind: 'over', fraction: 1, consumed, target: t, over: consumed - t };
  return { kind: 'ok', fraction: Math.min(1, total / target), consumed, target: t, remaining: t - consumed };
}
