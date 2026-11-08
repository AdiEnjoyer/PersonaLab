import { CHESSCOM } from '../constants';

export type ChessComError =
  | { kind: 'offline' }
  | { kind: 'not-found' }
  | { kind: 'rate-limited' }
  | { kind: 'timeout' }
  | { kind: 'server'; status: number }
  | { kind: 'http'; status: number }
  | { kind: 'unreadable' }
  | { kind: 'network-direct-no-proxy' }
  | { kind: 'network-proxy' };

export type ChessComResult<T> = { ok: true; data: T; receivedAt: number } | { ok: false; error: ChessComError };

export interface ChessComClient {
  get<T = unknown>(path: `/pub/${string}`): Promise<ChessComResult<T>>;
  /** Makes the next request go directly to Chess.com first again (R46.7). */
  resetRoute(): void;
}

export interface ChessComDeps {
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
  online(): boolean;
  proxyUrl(): string | Promise<string>;
  now(): number;
  onUnreachable(): void;
  timeoutMs?: number;
}

type Sent = { kind: 'response'; status: number; text: string } | { kind: 'timeout' } | { kind: 'network' };

/**
 * Serial Chess.com client (R46). One request at a time in FIFO order; direct first, then the CORS proxy after a
 * network/CORS failure when a proxy URL is stored; 429 is retried after 1, 2 and 4 s; nothing else is retried.
 */
export function createChessComClient(deps: ChessComDeps): ChessComClient {
  const timeoutMs = deps.timeoutMs ?? CHESSCOM.TIMEOUT_MS;
  let chain: Promise<unknown> = Promise.resolve();
  let useProxy = false;

  async function send(url: string): Promise<Sent> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Sent>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: 'timeout' });
      }, timeoutMs);
    });
    const request = (async (): Promise<Sent> => {
      try {
        const response = await deps.fetch(url, { method: 'GET', credentials: 'omit', mode: 'cors', signal: controller.signal });
        const text = await response.text();
        return { kind: 'response', status: response.status, text };
      } catch (e) {
        if (controller.signal.aborted) return { kind: 'timeout' };
        // Anything thrown by fetch itself (TypeError for network or CORS) is a network failure.
        void e;
        return { kind: 'network' };
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function attempt(path: string): Promise<ChessComResult<unknown>> {
    if (!deps.online()) return { ok: false, error: { kind: 'offline' } };
    const proxy = (await deps.proxyUrl()).replace(/\/+$/, '');
    let proxied = useProxy && proxy !== '';
    let retries = 0;
    for (;;) {
      const sent = await send((proxied ? proxy : CHESSCOM.BASE) + path);
      if (sent.kind === 'timeout') return { ok: false, error: { kind: 'timeout' } };
      if (sent.kind === 'network') {
        if (!proxied && proxy !== '') {
          proxied = true;
          useProxy = true;
          continue;
        }
        deps.onUnreachable();
        return { ok: false, error: { kind: proxied ? 'network-proxy' : 'network-direct-no-proxy' } };
      }
      const { status } = sent;
      if (status === 429) {
        const wait = CHESSCOM.RETRY_WAITS_MS[retries];
        if (wait === undefined) return { ok: false, error: { kind: 'rate-limited' } };
        retries += 1;
        await deps.sleep(wait);
        continue;
      }
      if (status === 404 || status === 410) return { ok: false, error: { kind: 'not-found' } };
      if (status >= 500) return { ok: false, error: { kind: 'server', status } };
      if (status !== 200) return { ok: false, error: { kind: 'http', status } };
      try {
        return { ok: true, data: JSON.parse(sent.text) as unknown, receivedAt: deps.now() };
      } catch {
        return { ok: false, error: { kind: 'unreadable' } };
      }
    }
  }

  return {
    get<T>(path: `/pub/${string}`): Promise<ChessComResult<T>> {
      const run = chain.then(() => attempt(path));
      chain = run.catch(() => undefined);
      return run as Promise<ChessComResult<T>>;
    },
    resetRoute() {
      useProxy = false;
    },
  };
}
