import { useReducedMotion } from '../motion/useReducedMotion';

export interface ProgressRingProps {
  /** 0 to 1; values above 1 draw a full ring. */
  fraction: number;
  variant?: 'normal' | 'over';
  size?: number;
  label?: string;
  /** Text under the label in the "over" variant, e.g. "Over target". */
  overLabel?: string;
}

const STROKE = 10;

export function ProgressRing({ fraction, variant = 'normal', size = 96, label, overLabel = 'Over target' }: ProgressRingProps) {
  const reduced = useReducedMotion();
  const r = (100 - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, fraction));
  const colour = variant === 'over' ? 'var(--pl-danger)' : 'var(--pl-accent)';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label ?? `${Math.round(clamped * 100)}%`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--pl-border)" strokeWidth={STROKE} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform="rotate(-90 50 50)"
          style={{ transition: reduced ? 'none' : 'stroke-dashoffset 300ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-sm tabular-nums">
        {label ? <span>{label}</span> : null}
        {variant === 'over' ? <span className="text-xs text-danger">{overLabel}</span> : null}
      </div>
    </div>
  );
}
