import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const env = { ALLOWED_ORIGIN: 'https://me.github.io' };

function stubUpstream() {
  const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('CORS proxy worker', () => {
  it('forwards a GET under /pub/ with the query and adds the CORS header', async () => {
    const upstream = stubUpstream();
    const res = await worker.fetch(new Request('https://proxy.dev/pub/player/x/stats?a=1'), env);
    expect(upstream).toHaveBeenCalledWith('https://api.chess.com/pub/player/x/stats?a=1', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(env.ALLOWED_ORIGIN);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('passes the upstream status through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect((await worker.fetch(new Request('https://proxy.dev/pub/player/nobody'), env)).status).toBe(404);
  });

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('rejects %s with 403 and no upstream request', async (method) => {
    const upstream = stubUpstream();
    const res = await worker.fetch(new Request('https://proxy.dev/pub/player/x', { method }), env);
    expect(res.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['https://proxy.dev/', 'https://proxy.dev/admin', 'https://proxy.dev/pub', 'https://proxy.dev/pub/../admin', 'https://proxy.dev/%2e%2e/x', 'https://proxy.dev/pub/%2e%2e/admin'])(
    'rejects %s with 403 and no upstream request',
    async (target) => {
      const upstream = stubUpstream();
      const res = await worker.fetch(new Request(target), env);
      expect(res.status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
});
