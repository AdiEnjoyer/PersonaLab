export type FetchFailureKind = 'timeout' | 'aborted' | 'network' | 'http';

/** A failed request: the timer fired, the caller aborted, the network failed, or the server answered with an error status. */
export class FetchError extends Error {
  override readonly name = 'FetchError';
  constructor(
    readonly kind: FetchFailureKind,
    /** HTTP status for `http` failures. */
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(kind === 'http' ? `HTTP ${status}` : kind, options);
  }
}

/**
 * `fetch` with a timeout. Rejects with `FetchError`: `timeout` (after `ms`), `aborted` (caller's signal),
 * `network` (a `TypeError` from fetch) or `http` (non-2xx status, with `status`).
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const callerSignal = init.signal ?? null;
  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted) throw new FetchError('aborted');
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new FetchError('http', response.status);
    return response;
  } catch (error) {
    if (error instanceof FetchError) throw error;
    if (timedOut) throw new FetchError('timeout', undefined, { cause: error });
    if (callerSignal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new FetchError('aborted', undefined, { cause: error });
    }
    throw new FetchError('network', undefined, { cause: error });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}