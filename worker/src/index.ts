/**
 * CORS proxy for the Chess.com public API (PersonaLab R46.10).
 * Forwards only `GET https://api.chess.com/pub/*` and answers everything else with 403 and no upstream request.
 */
export interface Env {
  /** The App origin, e.g. `https://yourname.github.io` (an origin has no path). */
  ALLOWED_ORIGIN: string;
}

const UPSTREAM = 'https://api.chess.com';

function reject(env: Env): Response {
  return new Response('Forbidden', {
    status: 403,
    headers: { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Content-Type': 'text/plain' },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'GET') return reject(env);
    const url = new URL(req.url);
    // The WHATWG URL parser has already resolved "." and ".." segments, including their %2e spellings.
    const path = new URL(url.pathname, 'https://x').pathname;
    if (!path.startsWith('/pub/')) return reject(env);

    let upstream: Response;
    try {
      upstream = await fetch(UPSTREAM + path + url.search, { method: 'GET' });
    } catch {
      return new Response('Bad gateway', { status: 502, headers: { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN } });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      },
    });
  },
};
