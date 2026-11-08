import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChessComClient, type ChessComClient } from '../chesscom';
import { chessComMessage } from '../messages';

type Reply = { status: number; body?: string } | 'network' | 'hang';

function setup(replies: Reply[], opts: { proxy?: string; online?: boolean } = {}) {
  const urls: string[] = [];
  const sleeps: number[] = [];
  const onUnreachable = vi.fn();
  let proxy = opts.proxy ?? '';
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    const reply = replies.shift();
    if (reply === undefined) throw new Error('unexpected request');
    if (reply === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    if (reply === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    return Promise.resolve(new Response(reply.body ?? '{"ok":true}', { status: reply.status }));
  });
  const client: ChessComClient = createChessComClient({
    fetch: fetchMock as unknown as typeof fetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    online: () => opts.online ?? true,
    proxyUrl: () => proxy,
    now: () => 42,
    onUnreachable,
  });
  return { client, urls, sleeps, fetchMock, onUnreachable, setProxy: (p: string) => (proxy = p) };
}

const PATH = '/pub/player/adi/stats';

describe('ChessCom client', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns parsed JSON on 200 with a plain direct GET', async () => {
    const t = setup([{ status: 200, body: '{"a":1}' }]);
    expect(await t.client.get(PATH)).toEqual({ ok: true, data: { a: 1 }, receivedAt: 42 });
    expect(t.urls).toEqual(['https://api.chess.com' + PATH]);
    expect(t.fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'omit' });
  });

  it.each([404, 410])('maps %i to not-found', async (status) => {
    const result = await setup([{ status }]).client.get(PATH);
    expect(result).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('maps 5xx, other statuses and non-JSON without retrying', async () => {
    expect((await setup([{ status: 503 }]).client.get(PATH))).toEqual({ ok: false, error: { kind: 'server', status: 503 } });
    expect((await setup([{ status: 403 }]).client.get(PATH))).toEqual({ ok: false, error: { kind: 'http', status: 403 } });
    expect((await setup([{ status: 200, body: '<html>' }]).client.get(PATH))).toEqual({ ok: false, error: { kind: 'unreadable' } });
  });

  it('retries 429 after 1, 2 and 4 s, then succeeds', async () => {
    const t = setup([{ status: 429 }, { status: 429 }, { status: 429 }, { status: 200 }]);
    expect((await t.client.get(PATH)).ok).toBe(true);
    expect(t.sleeps).toEqual([1000, 2000, 4000]);
  });

  it('reports rate-limited after the third retry is also 429', async () => {
    const t = setup([{ status: 429 }, { status: 429 }, { status: 429 }, { status: 429 }]);
    expect(await t.client.get(PATH)).toEqual({ ok: false, error: { kind: 'rate-limited' } });
    expect(t.fetchMock).toHaveBeenCalledTimes(4);
  });

  it('times out after 15 s without a retry', async () => {
    const t = setup(['hang']);
    const pending = t.client.get(PATH);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends nothing while offline', async () => {
    const t = setup([], { online: false });
    expect(await t.client.get(PATH)).toEqual({ ok: false, error: { kind: 'offline' } });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('without a proxy, a network error is network-direct-no-proxy and reports unreachable', async () => {
    const t = setup(['network']);
    expect(await t.client.get(PATH)).toEqual({ ok: false, error: { kind: 'network-direct-no-proxy' } });
    expect(t.onUnreachable).toHaveBeenCalledTimes(1);
  });

  it('falls back to the proxy once after a direct network error and keeps using it', async () => {
    const t = setup(['network', { status: 200 }, { status: 200 }], { proxy: 'https://p.example.workers.dev/' });
    expect((await t.client.get(PATH)).ok).toBe(true);
    expect((await t.client.get('/pub/player/adi')).ok).toBe(true);
    expect(t.urls).toEqual([
      'https://api.chess.com' + PATH,
      'https://p.example.workers.dev' + PATH,
      'https://p.example.workers.dev/pub/player/adi',
    ]);
  });

  it('does not fall back to the proxy for HTTP errors', async () => {
    const t = setup([{ status: 500 }], { proxy: 'https://p.example.workers.dev' });
    await t.client.get(PATH);
    expect(t.urls).toHaveLength(1);
  });

  it('a proxy network error is network-proxy; resetRoute goes direct first again', async () => {
    const t = setup(['network', 'network', { status: 200 }], { proxy: 'https://p.example.workers.dev' });
    expect(await t.client.get(PATH)).toEqual({ ok: false, error: { kind: 'network-proxy' } });
    t.client.resetRoute();
    await t.client.get(PATH);
    expect(t.urls[2]).toBe('https://api.chess.com' + PATH);
  });

  it('sends one request at a time, in order', async () => {
    const order: string[] = [];
    let active = 0;
    let peak = 0;
    const client = createChessComClient({
      fetch: (async (input: RequestInfo | URL) => {
        active += 1;
        peak = Math.max(peak, active);
        order.push(String(input));
        await Promise.resolve();
        active -= 1;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
      sleep: () => Promise.resolve(),
      online: () => true,
      proxyUrl: () => '',
      now: () => 0,
      onUnreachable: () => undefined,
    });
    await Promise.all([client.get('/pub/a'), client.get('/pub/b'), client.get('/pub/c')]);
    expect(peak).toBe(1);
    expect(order.map((u) => u.slice(-1))).toEqual(['a', 'b', 'c']);
  });

  it('has the exact owner-facing messages', () => {
    expect(chessComMessage({ kind: 'rate-limited' })).toBe('Chess.com is limiting requests. Try again later.');
    expect(chessComMessage({ kind: 'server', status: 502 })).toBe('Chess.com is unavailable (HTTP 502). Try again later.');
    expect(chessComMessage({ kind: 'not-found' })).toBe('Chess.com user not found');
    expect(chessComMessage({ kind: 'network-proxy' })).toMatch(/check the CORS proxy URL in Settings\.$/);
  });
});
