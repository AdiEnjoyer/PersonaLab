import { AppLink } from '../../../app/AppLink';
import { ProgressRing } from '../../../ui/ring/ProgressRing';
import type { RingState } from '../logic/rings';

export interface RingBlockProps {
  title: string;
  unit: 'kcal' | 'g';
  state: RingState;
  size?: number;
  /** Why there is no target: no Profile yet, or the energy values could not be read (R29.13, R32.6). */
  missing?: 'profile' | 'error';
}

/** One progress ring with consumed, target and remaining or over amounts (R32.1 to R32.3, R32.6). */
export function RingBlock({ title, unit, state, size = 88, missing = 'profile' }: RingBlockProps) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={title}>
      <ProgressRing
        size={size}
        fraction={state.kind === 'no-target' ? 0 : state.fraction}
        variant={state.kind === 'over' ? 'over' : 'normal'}
        label={`${state.consumed}`}
        overLabel="Over target"
      />
      <div className="flex min-w-0 flex-col text-sm tabular-nums">
        <span className="font-medium">{title}</span>
        <span>
          {state.consumed} {state.kind === 'no-target' ? unit : `of ${state.target} ${unit}`}
        </span>
        {state.kind === 'ok' ? <span className="text-muted">{state.remaining} {unit} left</span> : null}
        {state.kind === 'over' ? <span className="text-danger">Over target by {state.over} {unit}</span> : null}
        {state.kind === 'no-target' ? (
          missing === 'error' ? (
            <span className="text-muted">Target unavailable</span>
          ) : (
            <AppLink to="/settings" className="tap flex items-center text-accent underline">
              Set up your profile in Settings
            </AppLink>
          )
        ) : null}
      </div>
    </div>
  );
}