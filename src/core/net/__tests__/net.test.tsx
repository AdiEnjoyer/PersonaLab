import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ageLabel } from '../ageLabel';
import { fetchWithTimeout, FetchError } from '../fetchWithTimeout';
import { isOnline, reportUnreachable, useOnline } from '../online';
import { useRemoteResource } from '../swr';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ageLabel', () => {
  it('picks the unit by threshold', () => {
    expect(ageLabel(1000, 500)).toBe('Updated just now');
    expect(ageLabel(0, 59_999)).toBe('Updated just now');
    expect(ageLabel(0, 60_000)).toBe('Updated 1 min ago');
    expect(ageLabel(0, 3_600_000 - 1)).toBe('Updated 59 min ago');
    expect(ageLabel(0, 3 * 3_600_000)).toBe('Updated 3 h ago');
    expect(ageLabel(0, 49 * 3_600_000)).toBe('Updated 2 d ago');
  });
});

describe('fetchWithTimeout', () => {
  it('reports timeout, caller abort, network error and HTTP status', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))));
    const timeout = fetchWithTimeout('/a', {}, 100);
    const t = expect(timeout).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(100);
    await t;

    const controller = new AbortController();
    const aborted = expect(fetchWithTimeout('/a', { signal: controller.signal }, 100)).rejects.toMatchObject({ kind: 'aborted' });
    controller.abort();
    await aborted;

    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(fetchWithTimeout('/a')).rejects.toMatchObject({ kind: 'network' });

    vi.stubGlobal('fetch', () => Promise.resolve(new Response('no', { status: 503 })));
    const error = await fetchWithTimeout('/a').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
    expect(error).toMatchObject({ kind: 'http', status: 503 });
  });
});

describe('online state', () => {
  beforeEach(() => vi.useFakeTimers());

  it('goes unreachable, probes version.json every 5 s and recovers', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('down')).mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useOnline());
    expect(result.current.online).toBe(true);
    act(() => reportUnreachable());
    expect(result.current.online).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.online).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.online).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/version\.json$/);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ cache: 'no-store' });
  });

  it('the online event clears the unreachable flag', () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    act(() => reportUnreachable());
    expect(isOnline()).toBe(false);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(isOnline()).toBe(true);
  });
});

describe('useRemoteResource', () => {
  it('two components share one fetch, and a failure keeps cached data', async () => {
    const cache = { data: 'old', fetchedAt: 0 };
    let calls = 0;
    let fail = false;
    const opts = {
      key: 'k1',
      readCache: () => cache,
      fetchFresh: async () => {
        calls++;
        await Promise.resolve();
        if (fail) throw new Error('boom');
        return { data: 'new', fetchedAt: Date.now() };
      },
      maxAgeMs: 1000,
    };
    const a = renderHook(() => useRemoteResource(opts));
    const b = renderHook(() => useRemoteResource(opts));
    await waitFor(() => expect(a.result.current.data).toBe('new'));
    await waitFor(() => expect(b.result.current.data).toBe('new'));
    expect(calls).toBe(1);
    expect(a.result.current.state).toBe('fresh');

    fail = true;
    const c = renderHook(() => useRemoteResource({ ...opts, key: 'k2' }));
    await waitFor(() => expect(c.result.current.state).toBe('failed'));
    expect(c.result.current.data).toBe('old');
    expect(c.result.current.fetchedAt).toBe(0);
  });
});