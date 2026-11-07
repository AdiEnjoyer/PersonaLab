import type { ReactNode } from 'react';
import { CardFrame } from '../primitives/CardFrame';
import { useSkeletonGate } from './useSkeletonGate';

/** Fixed row height in px, so swapping skeleton for content moves nothing (R62.3). */
export const SKELETON_ROW_HEIGHT = 56;

export interface SkeletonProps {
  /** Rows to draw; use `ceil(visibleHeight / SKELETON_ROW_HEIGHT)`. */
  rows?: number;
}

export function skeletonRows(visibleHeight: number): number {
  return Math.max(1, Math.ceil(visibleHeight / SKELETON_ROW_HEIGHT));
}

export function Skeleton({ rows = 3 }: SkeletonProps) {
  return (
    <CardFrame aria-hidden="true" data-testid="skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="pl-shimmer mb-2 rounded-continuous last:mb-0" style={{ height: SKELETON_ROW_HEIGHT - 8 }} />
      ))}
    </CardFrame>
  );
}

/** Shows nothing, then a skeleton, then `children`, following the skeleton gate. Errors should bypass it. */
export function SkeletonGate({ loading, rows, children }: { loading: boolean; rows?: number; children: ReactNode }) {
  const phase = useSkeletonGate(loading);
  if (phase === 'blank') return null;
  if (phase === 'skeleton') return <Skeleton {...(rows !== undefined ? { rows } : {})} />;
  return <>{children}</>;
}
