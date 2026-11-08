import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineCancelled, EngineClient, EngineStartError, EngineStopped, parseInfo, type EngineTransport } from '../client';
type Behaviour = {
  /** Answers to `uci`/`isready`; false = stay silent. */
  ready?: boolean;
  /** Called for each `go`; return false to stay silent, 'crash' to raise a worker error. */
  onGo?: (fen: string, emit: (line: string) => void) => boolean | 'crash' | void;
};
class FakeWorker implements EngineTransport {
  commands: string[] = [];
  terminated = false;
  private line: (l: string) => void = () => undefined;
  private error: (e: unknown) => void = () => undefined;
  fen = '';
  constructor(private readonly behaviour: Behaviour) {}
  post(cmd: string): void {
    this.commands.push(cmd);
    const emit = (l: string) => queueMicrotask(() => !this.terminated && this.line(l));
    if (cmd === 'uci' && this.behaviour.ready !== false) emit('uciok');
    else if (cmd === 'isready' && this.behaviour.ready !== false) emit('readyok');
    else if (cmd.startsWith('position fen ')) this.fen = cmd.slice('position fen '.length);
    else if (cmd.startsWith('go ')) {
      const r = this.behaviour.onGo?.(this.fen, emit);
      if (r === 'crash') queueMicrotask(() => this.error(new Error('boom')));
      else if (r === undefined) {
        emit('info depth 11 seldepth 14 multipv 1 score cp 10 nodes 1 pv d2d4');
        emit('info depth 12 seldepth 15 multipv 1 score cp 31 nodes 9 pv e2e4 e7e5 g1f3 b8c6');
        emit('bestmove e2e4 ponder e7e5');
      }
    } else if (cmd === 'stop') this.behaviour.onGo?.('stop', emit);
  }
  onLine(cb: (l: string) => void): void {
    this.line = cb;
  }
  onError(cb: (e: unknown) => void): void {
    this.error = cb;
  }
  terminate(): void {
    this.terminated = true;
  }
}
function harness(...behaviours: Behaviour[]) {
  const workers: FakeWorker[] = [];
  const client = new EngineClient(() => {
    const w = new FakeWorker(behaviours[Math.min(workers.length, behaviours.length - 1)] ?? {});
    workers.push(w);
    return w;
  });
  return { client, workers };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('parseInfo', () => {
  it('reads cp, mate and pv; ignores other multipv lines and non-scores', () => {
    expect(parseInfo('info depth 12 score cp -34 nodes 5 pv e2e4 e7e5')).toEqual({ depth: 12, eval: { kind: 'cp', cp: -34 }, pv: ['e2e4', 'e7e5'], bound: false });
    expect(parseInfo('info depth 8 score mate -3 pv a1a2')?.eval).toEqual({ kind: 'mate', n: -3 });
    expect(parseInfo('info depth 8 score mate 0 pv a1a2')?.eval).toEqual({ kind: 'mated' });
    expect(parseInfo('info depth 8 score cp 5 lowerbound pv a1a2')?.bound).toBe(true);
    expect(parseInfo('info depth 8 multipv 2 score cp 5 pv a1a2')).toBeNull();
    expect(parseInfo('info string NNUE evaluation')).toBeNull();
    expect(parseInfo('bestmove e2e4')).toBeNull();
  });
});
describe('EngineClient', () => {
  it('starts with uci, Hash and isready, then analyses to the requested depth and keeps 3 pv moves', async () => {
    const { client, workers } = harness({});
    const result = await client.analyse('startfen', 12);
    expect(result).toEqual({ eval: { kind: 'cp', cp: 31 }, bestUci: 'e2e4', pv: ['e2e4', 'e7e5', 'g1f3'] });
    expect(workers[0]!.commands).toEqual(['uci', 'setoption name Hash value 16', 'isready', 'position fen startfen', 'go depth 12']);
  });
  it('fails to start after 10 s without readyok', async () => {
    const { client, workers } = harness({ ready: false });
    const started = client.start();
    const failed = expect(started).rejects.toBeInstanceOf(EngineStartError);
    await vi.advanceTimersByTimeAsync(10_000);
    await failed;
    expect(workers[0]!.terminated).toBe(true);
  });
  it('reports a transport that cannot be created as a start failure', async () => {
    const client = new EngineClient(() => {
      throw new Error('no worker');
    });
    await expect(client.start()).rejects.toBeInstanceOf(EngineStartError);
  });
  it('restarts once after a crash and then returns the result', async () => {
    let calls = 0;
    const { client, workers } = harness({ onGo: () => (++calls === 1 ? 'crash' : undefined) });
    const result = await client.analyse('f', 12);
    expect(result.bestUci).toBe('e2e4');
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);
  });
  it('restarts after a 60 s timeout, and fails clearly after the second failure', async () => {
    const { client, workers } = harness({ onGo: () => false });
    const p = client.analyse('f', 12);
    const failed = expect(p).rejects.toBeInstanceOf(EngineStopped);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await failed;
    expect(workers).toHaveLength(2);
  });
  it('stop waits for bestmove and rejects the search as cancelled', async () => {
    const { client, workers } = harness({
      onGo: (fen, emit) => {
        if (fen === 'stop') emit('bestmove e2e4');
        return fen === 'stop' ? undefined : false;
      },
    });
    const p = client.analyse('f', 12);
    const cancelled = expect(p).rejects.toBeInstanceOf(EngineCancelled);
    await vi.advanceTimersByTimeAsync(0);
    await client.stop();
    await cancelled;
    expect(workers[0]!.commands).toContain('stop');
    expect(workers[0]!.terminated).toBe(false);
  });
  it('stop terminates the worker when no bestmove comes within 1 s, and the next search starts a new one', async () => {
    let silent = true;
    const { client, workers } = harness({ onGo: (fen) => (fen === 'stop' ? undefined : silent ? false : undefined) });
    const p = client.analyse('f', 12);
    const cancelled = expect(p).rejects.toBeInstanceOf(EngineCancelled);
    await vi.advanceTimersByTimeAsync(0);
    const stopped = client.stop();
    await vi.advanceTimersByTimeAsync(1000);
    await stopped;
    await cancelled;
    expect(workers[0]!.terminated).toBe(true);
    silent = false;
    const next = client.analyse('g', 12);
    await vi.advanceTimersByTimeAsync(0);
    expect(workers).toHaveLength(2);
    await expect(next).resolves.toMatchObject({ bestUci: 'e2e4' });
  });
});
