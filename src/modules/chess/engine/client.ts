import { ENGINE } from '../constants';
/** Transport to a UCI engine: lines in, commands out. The real one wraps a Web Worker. */
export interface EngineTransport {
  post(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  onError(cb: (e: unknown) => void): void;
  terminate(): void;
}
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};
/** Evaluation from the point of view of the side to move (as UCI reports it). `mated` is `score mate 0`. */
export type EngineEval = { kind: 'cp'; cp: number } | { kind: 'mate'; n: number } | { kind: 'mated' };
export interface EngineResult {
  eval: EngineEval;
  bestUci: string;
  /** The first 3 principal-variation moves (fewer when the line is shorter). */
  pv: string[];
}
/** The Worker or the WASM did not load, or the engine was not ready within 10 s (R55.8). */
export class EngineStartError extends Error {
  override name = 'EngineStartError';
}
/** No best move within 60 s for one position (R55.9). */
export class EngineTimeout extends Error {
  override name = 'EngineTimeout';
}
/** The Worker reported an error, or answered without a usable best move. */
export class EngineCrash extends Error {
  override name = 'EngineCrash';
}
/** The search was stopped on request. */
export class EngineCancelled extends Error {
  override name = 'EngineCancelled';
}
/** The position failed twice, even after a restart (R55.9). */
export class EngineStopped extends Error {
  override name = 'EngineStopped';
}
export interface ParsedInfo {
  depth: number;
  eval: EngineEval;
  pv: string[];
  bound: boolean;
}
/** Parses `info depth D [multipv 1] score cp|mate X [lower|upperbound] ... pv m1 m2 ...`; null for other lines (R55.2). */
export function parseInfo(line: string): ParsedInfo | null {
  if (!line.startsWith('info ')) return null;
  const t = line.trim().split(/\s+/);
  const at = (key: string): number => t.indexOf(key);
  const di = at('depth');
  const si = at('score');
  const pi = at('pv');
  if (di < 0 || si < 0 || pi < 0) return null;
  const mp = at('multipv');
  if (mp >= 0 && t[mp + 1] !== '1') return null;
  const depth = Number(t[di + 1]);
  const value = Number(t[si + 2]);
  if (!Number.isInteger(depth) || !Number.isFinite(value)) return null;
  const kind = t[si + 1];
  let ev: EngineEval;
  if (kind === 'cp') ev = { kind: 'cp', cp: Math.round(value) };
  else if (kind === 'mate') ev = value === 0 ? { kind: 'mated' } : { kind: 'mate', n: Math.trunc(value) };
  else return null;
  const bound = t[si + 3] === 'lowerbound' || t[si + 3] === 'upperbound';
  return { depth, eval: ev, pv: t.slice(pi + 1), bound };
}
interface Search {
  cancelled: boolean;
  abort(): void;
  whenDone: Array<() => void>;
}
/** UCI client over an `EngineTransport`: start, analyse with one automatic restart, stop, terminate (R55). */
export class EngineClient {
  private transport: EngineTransport | null = null;
  private generation = 0;
  private lineHandler: ((line: string) => void) | null = null;
  private errorHandler: ((e: unknown) => void) | null = null;
  private current: Search | null = null;
  constructor(
    private readonly makeTransport: () => EngineTransport,
    private readonly timers: Timers = defaultTimers,
  ) {}
  private open(): EngineTransport {
    const gen = ++this.generation;
    const t = this.makeTransport();
    t.onLine((l) => {
      if (gen === this.generation) this.lineHandler?.(l);
    });
    t.onError((e) => {
      if (gen === this.generation) this.errorHandler?.(e);
    });
    this.transport = t;
    return t;
  }
  private closeTransport(): void {
    this.generation++;
    this.lineHandler = null;
    this.errorHandler = null;
    const t = this.transport;
    this.transport = null;
    try {
      t?.terminate();
    } catch {
      /* already gone */
    }
  }
  /** `uci` → `uciok`, `setoption Hash`, `isready` → `readyok`, all within 10 s (R55.8). */
  async start(): Promise<void> {
    this.current?.abort();
    this.closeTransport();
    let t: EngineTransport;
    try {
      t = this.open();
    } catch (e) {
      throw new EngineStartError(e instanceof Error ? e.message : 'The engine could not be created.');
    }
    await new Promise<void>((resolve, reject) => {
      let phase: 'uci' | 'ready' = 'uci';
      let timer: unknown;
      const finish = (error?: Error): void => {
        this.timers.clearTimeout(timer);
        this.lineHandler = null;
        this.errorHandler = null;
        if (error) {
          this.closeTransport();
          reject(error);
        } else resolve();
      };
      timer = this.timers.setTimeout(() => finish(new EngineStartError('The engine was not ready in time.')), ENGINE.READY_TIMEOUT_MS);
      this.errorHandler = (e) => finish(new EngineStartError(e instanceof Error ? e.message : 'The engine failed to load.'));
      this.lineHandler = (line) => {
        const text = line.trim();
        try {
          if (phase === 'uci' && text === 'uciok') {
            phase = 'ready';
            t.post(`setoption name Hash value ${ENGINE.HASH_MB}`);
            t.post('isready');
          } else if (phase === 'ready' && text === 'readyok') finish();
        } catch (e) {
          finish(new EngineStartError(e instanceof Error ? e.message : 'The engine failed.'));
        }
      };
      try {
        t.post('uci');
      } catch (e) {
        finish(new EngineStartError(e instanceof Error ? e.message : 'The engine failed.'));
      }
    });
  }
  /** Fresh start of the worker. */
  restart(): Promise<void> {
    return this.start();
  }
  /** Tells the engine a new game begins (clears its hash). */
  newGame(): void {
    try {
      this.transport?.post('ucinewgame');
    } catch {
      /* the next search reports the failure */
    }
  }
  /**
   * Evaluates `fen` to `depth` (R55.2). Starts the engine when needed. A crash or timeout restarts the worker and
   * retries once; the second failure throws `EngineStopped` (R55.9).
   */
  async analyse(fen: string, depth: number): Promise<EngineResult> {
    if (this.transport === null) await this.start();
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.search(fen, depth);
      } catch (e) {
        if (e instanceof EngineCancelled) throw e;
        if (attempt >= 1) throw new EngineStopped('The engine stopped responding.');
        try {
          await this.restart();
        } catch {
          throw new EngineStopped('The engine stopped responding.');
        }
      }
    }
  }
  private search(fen: string, depth: number): Promise<EngineResult> {
    return new Promise<EngineResult>((resolve, reject) => {
      const t = this.transport;
      if (t === null) {
        reject(new EngineCrash('The engine is not running.'));
        return;
      }
      let best: ParsedInfo | null = null;
      let timer: unknown;
      const search: Search = { cancelled: false, abort: () => done(() => reject(new EngineCancelled('Cancelled.'))), whenDone: [] };
      const done = (fn: () => void): void => {
        if (this.current !== search) return;
        this.timers.clearTimeout(timer);
        this.current = null;
        this.lineHandler = null;
        this.errorHandler = null;
        fn();
        for (const cb of search.whenDone) cb();
      };
      timer = this.timers.setTimeout(() => done(() => reject(new EngineTimeout('No answer within the time limit.'))), ENGINE.MOVE_TIMEOUT_MS);
      this.errorHandler = (e) => done(() => reject(new EngineCrash(e instanceof Error ? e.message : 'The engine reported an error.')));
      this.lineHandler = (line) => {
        const info = parseInfo(line);
        if (info !== null) {
          // Prefer the deepest result; at equal depth a final (non-bound) line wins.
          if (best === null || info.depth > best.depth || (info.depth === best.depth && (!info.bound || best.bound))) best = info;
          return;
        }
        if (!line.startsWith('bestmove')) return;
        const move = line.trim().split(/\s+/)[1];
        if (search.cancelled) return done(() => reject(new EngineCancelled('Cancelled.')));
        if (move === undefined || move === '(none)' || move === '0000' || best === null) {
          return done(() => reject(new EngineCrash('The engine returned no best move.')));
        }
        const found = best;
        done(() => resolve({ eval: found.eval, bestUci: move, pv: (found.pv.length > 0 ? found.pv : [move]).slice(0, 3) }));
      };
      this.current = search;
      try {
        t.post(`position fen ${fen}`);
        t.post(`go depth ${depth}`);
      } catch (e) {
        done(() => reject(new EngineCrash(e instanceof Error ? e.message : 'The engine failed.')));
      }
    });
  }
  /** Stops the running search; terminates the worker when no `bestmove` arrives within 1 s (R55.6). */
  async stop(): Promise<void> {
    const s = this.current;
    if (s === null) return;
    s.cancelled = true;
    await new Promise<void>((resolve) => {
      const timer = this.timers.setTimeout(() => {
        this.closeTransport();
        s.abort();
        resolve();
      }, ENGINE.STOP_TIMEOUT_MS);
      s.whenDone.push(() => {
        this.timers.clearTimeout(timer);
        resolve();
      });
      try {
        this.transport?.post('stop');
      } catch {
        /* the timer terminates the worker */
      }
    });
  }
  /** Ends the worker and any search. */
  terminate(): void {
    const s = this.current;
    this.closeTransport();
    s?.abort();
  }
}
