import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkeletonGate } from '../useSkeletonGate';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('useSkeletonGate', () => {
  it('skips the skeleton when data arrives within 150 ms', () => {
    const { result, rerender } = renderHook(({ loading }) => useSkeletonGate(loading), { initialProps: { loading: true } });
    expect(result.current).toBe('blank');
    advance(100);
    rerender({ loading: false });
    expect(result.current).toBe('content');
    advance(500);
    expect(result.current).toBe('content');
  });

  it('keeps a shown skeleton for at least 200 ms', () => {
    const { result, rerender } = renderHook(({ loading }) => useSkeletonGate(loading), { initialProps: { loading: true } });
    advance(150);
    expect(result.current).toBe('skeleton');
    advance(50); // data at 200 ms: skeleton has been visible 50 ms
    rerender({ loading: false });
    expect(result.current).toBe('skeleton');
    advance(149);
    expect(result.current).toBe('skeleton');
    advance(1);
    expect(result.current).toBe('content');
  });

  it('switches at once when the skeleton has been visible long enough', () => {
    const { result, rerender } = renderHook(({ loading }) => useSkeletonGate(loading), { initialProps: { loading: true } });
    advance(400);
    expect(result.current).toBe('skeleton');
    rerender({ loading: false });
    expect(result.current).toBe('content');
  });
});
