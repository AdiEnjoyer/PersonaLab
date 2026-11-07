import { Button } from '../../../ui/primitives/Button';
import { remainingLabel, restView, type RestTimerState } from '../logic/restTimer';
import type { RestAction } from '../logic/session';
import { useNow } from './useNow';
/** Rest countdown. Full controls in the Session_Logger, a compact read-out elsewhere (R20.3 to R20.7). */
export function RestTimerBar({ timer, compact = false, onAction }: { timer: RestTimerState | undefined; compact?: boolean; onAction?(action: RestAction): void }) {
  const running = timer !== undefined && timer.endAt > Date.now();
  const now = useNow(250, timer !== undefined && (running || timer.alertDismissed !== true));
  const view = restView(timer, now);
  if (view.kind === 'none') return null;
  if (compact) {
    return (
      <span role="timer" className={`tabular-nums ${view.kind === 'alert' ? 'font-semibold text-danger' : ''}`}>
        {view.kind === 'alert' ? 'Rest over 0:00' : remainingLabel(view.endAt, now)}
      </span>
    );
  }
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-continuous border border-line bg-surface p-3" role="timer" aria-live="off">
      {view.kind === 'alert' ? (
        <>
          <span className="text-lg font-semibold text-danger tabular-nums">0:00</span>
          <span className="flex-1 font-medium text-danger">Rest is over</span>
          <Button variant="secondary" onClick={() => onAction?.('dismiss')}>
            Dismiss
          </Button>
        </>
      ) : (
        <>
          <span className="text-2xl font-semibold tabular-nums">{remainingLabel(view.endAt, now)}</span>
          <span className="flex-1" />
          <Button variant="secondary" aria-label="Minus 15 seconds" onClick={() => onAction?.('minus15')}>
            {'\u221215 s'}
          </Button>
          <Button variant="secondary" aria-label="Plus 15 seconds" onClick={() => onAction?.('plus15')}>
            +15 s
          </Button>
          <Button variant="ghost" onClick={() => onAction?.('skip')}>
            Skip
          </Button>
        </>
      )}
    </div>
  );
}
