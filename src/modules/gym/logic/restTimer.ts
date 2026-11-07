import { REST } from '../constants';
/** Rest timer arithmetic on end timestamps (R20). */
export interface RestTimerState {
  endAt: number;
  alertDismissed?: boolean;
}
const ADJUST_MS = REST.ADJUST * 1000;
const MAX_REMAINING_MS = REST.MAX * 1000;
/** The countdown that starts when a Set is completed at `completedAt` (R20.1). */
export const startRest = (completedAt: number, restSec: number): { endAt: number } => ({ endAt: completedAt + restSec * 1000 });
/** "-15 s": 'ended' when 15 s or fewer remain, otherwise the end moves 15 s earlier (R20.4). */
export function minus15(endAt: number, now: number): { endAt: number } | 'ended' {
  return endAt - now <= ADJUST_MS ? 'ended' : { endAt: endAt - ADJUST_MS };
}
/** "+15 s": remaining time plus 15 s, capped at 600 s (R20.4). */
export function plus15(endAt: number, now: number): { endAt: number } {
  return { endAt: now + Math.min(Math.max(0, endAt - now) + ADJUST_MS, MAX_REMAINING_MS) };
}
/** M:SS of the remaining time, rounded up to the next whole second (R20.3). */
export function remainingLabel(endAt: number, now: number): string {
  const s = Math.ceil(Math.max(0, endAt - now) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export type RestView = { kind: 'none' } | { kind: 'running'; endAt: number } | { kind: 'alert' };
/** What to show for a stored timer at `now` (R20.5). */
export function restView(timer: RestTimerState | undefined, now: number): RestView {
  if (timer === undefined) return { kind: 'none' };
  if (timer.endAt > now) return { kind: 'running', endAt: timer.endAt };
  return timer.alertDismissed === true ? { kind: 'none' } : { kind: 'alert' };
}
