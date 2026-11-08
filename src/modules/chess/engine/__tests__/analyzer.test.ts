import { describe, expect, it } from 'vitest';
import { ANALYSER_VERSION, ANALYSIS_DEPTH } from '../../constants';
import type { GameReport } from '../../logic/analysis/report';
import type { EvalRecord, GameRecord } from '../../types';
import { GameAnalyzer, type AnalyzerDeps, type EnginePort } from '../analyzer';
import { EngineCancelled, EngineStartError, EngineStopped, type EngineResult } from '../client';
/** 1. f3 e5 2. g4 Qh4#: five positions, the last one checkmate. */
const FOOLS = '[Event "x"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const game = (id: string, over: Partial<GameRecord> = {}): GameRecord => ({
  id,
  idemKey: id,
  pgn: FOOLS,
  timeClass: 'rapid',
  timeControl: '600',
  endTime: 1,
  rated: true,
  white: { username: 'adi', result: 'checkmated' },
  black: { username: 'bob', result: 'win' },
  syncedFor: 'adi',
  ownerColour: 'w',
  ownerResult: 'loss',
  pgnUnreadable: false,
  ...over,
});
const result: EngineResult = { eval: { kind: 'cp', cp: 20 }, bestUci: 'e2e4', pv: ['e2e4'] };
type Pending = { fen: string; resolve(r: EngineResult): void; reject(e: unknown): void };
class FakeEngine implements EnginePort {
  fens: string[] = [];
  pending: Pending[] = [];
  /** When true, `analyse` waits for `release()`; otherwise it answers at once. */
  manual = false;
  failWith: unknown = null;
  stops = 0;
  analyse(fen: string): Promise<EngineResult> {
    this.fens.push(fen);
    if (this.failWith) return Promise.reject(this.failWith);
    if (!this.manual) return Promise.resolve(result);
    return new Promise((resolve, reject) => this.pending.push({ fen, resolve, reject }));
  }
  async stop(): Promise<void> {
    this.stops++;
    for (const p of this.pending.splice(0)) p.reject(new EngineCancelled('stopped'));
  }
  release(): void {
    for (const p of this.pending.splice(0)) p.resolve(result);
  }
}
function setup(games: GameRecord[], opts: { stored?: EvalRecord[]; hidden?: boolean } = {}) {
  const engine = new FakeEngine();
  const evals = new Map<string, EvalRecord>();
  for (const e of opts.stored ?? []) evals.set(`${e.gameId}:${e.ply}`, e);
  const reports = new Map<string, GameReport>();
  const saved: string[] = [];
  const vis = { hidden: opts.hidden ?? false, cbs: new Set<() => void>() };
  const flags = { failEvalWrite: false };
  const deps: AnalyzerDeps = {
    engine,
    store: {
      readEvals: async (id) => new Map([...evals.values()].filter((e) => e.gameId === id).map((e) => [e.ply, e])),
      saveEval: async (r) => {
        if (flags.failEvalWrite) throw new Error('disk full');
        evals.set(`${r.gameId}:${r.ply}`, r);
        saved.push(`${r.gameId}:${r.ply}`);
      },
      saveReport: async (r) => {
        reports.set(r.gameId, r);
      },
    },
    loadGame: async (id) => games.find((g) => g.id === id),
    loadTips: async () => [],
    readBand: async () => '1000–1199',
    now: () => 42,
    visibility: {
      hidden: () => vis.hidden,
      subscribe: (cb) => {
        vis.cbs.add(cb);
        return () => vis.cbs.delete(cb);
      },
    },
  };
  const analyzer = new GameAnalyzer(deps);
  const setHidden = (h: boolean) => {
    vis.hidden = h;
    vis.cbs.forEach((cb) => cb());
  };
  const idle = async () => {
    for (let i = 0; i < 50 && analyzer.getState().running; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { analyzer, engine, evals, reports, saved, setHidden, idle, flags };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ev = (gameId: string, ply: number): EvalRecord => ({ gameId, depth: ANALYSIS_DEPTH, version: ANALYSER_VERSION, ply, eval: { kind: 'cp', cp: 20 }, bestUci: 'e2e4', pv: ['e2e4'] });
describe('GameAnalyzer', () => {
  it('analyses a short game end to end, storing the checkmate position without the engine', async () => {
    const t = setup([game('g1')]);
    t.analyzer.enqueue(['g1']);
    await t.idle();
    expect(t.engine.fens).toHaveLength(4);
    expect(t.saved).toEqual(['g1:0', 'g1:1', 'g1:2', 'g1:3', 'g1:4']);
    expect(t.evals.get('g1:4')?.eval).toEqual({ kind: 'mated' });
    const report = t.reports.get('g1')!;
    expect(report).toMatchObject({ gameId: 'g1', depth: ANALYSIS_DEPTH, version: ANALYSER_VERSION, createdAt: 42, band: '1000–1199' });
    expect(t.analyzer.getState()).toMatchObject({ running: false, current: null, error: null, finished: ['g1'] });
  });
  it('resumes from partial evaluations and sends no stored position to the engine', async () => {
    const t = setup([game('g1')], { stored: [ev('g1', 0), ev('g1', 1)] });
    t.analyzer.enqueue(['g1']);
    await t.idle();
    expect(t.engine.fens).toHaveLength(2);
    expect(t.saved).toEqual(['g1:2', 'g1:3', 'g1:4']);
    expect(t.reports.has('g1')).toBe(true);
  });
  it('reports progress as positions with a stored evaluation out of the total', async () => {
    const t = setup([game('g1')], { stored: [ev('g1', 0)] });
    t.engine.manual = true;
    t.analyzer.enqueue(['g1']);
    await tick();
    expect(t.analyzer.getState().current).toEqual({ gameId: 'g1', done: 1, total: 5 });
    t.engine.release();
    await tick();
    expect(t.analyzer.getState().current).toEqual({ gameId: 'g1', done: 2, total: 5 });
    await t.analyzer.cancel();
  });
  it('cancel stops the engine, clears the queue and keeps the stored evaluations', async () => {
    const t = setup([game('g1'), game('g2')]);
    t.engine.manual = true;
    t.analyzer.enqueue(['g1', 'g2']);
    await tick();
    t.engine.release();
    await tick();
    await t.analyzer.cancel();
    expect(t.engine.stops).toBeGreaterThan(0);
    expect(t.analyzer.getState()).toMatchObject({ running: false, queue: [], current: null });
    const kept = t.saved.length;
    expect(kept).toBeGreaterThanOrEqual(1);
    expect(t.saved[0]).toBe('g1:0');
    expect(t.reports.size).toBe(0);
    // A later request continues from the first position without an evaluation.
    t.engine.manual = false;
    t.engine.fens = [];
    t.analyzer.enqueue(['g1']);
    await t.idle();
    expect(t.engine.fens).toHaveLength(4 - kept);
    expect(t.reports.has('g1')).toBe(true);
  });
  it('pauses while the App is hidden and continues the same position when visible again', async () => {
    const t = setup([game('g1')]);
    t.engine.manual = true;
    t.analyzer.enqueue(['g1']);
    await tick();
    expect(t.engine.fens).toHaveLength(1);
    t.setHidden(true);
    await tick();
    expect(t.analyzer.getState().paused).toBe(true);
    expect(t.engine.stops).toBe(1);
    expect(t.engine.fens).toHaveLength(1);
    expect(t.saved).toEqual([]);
    t.setHidden(false);
    await tick();
    expect(t.analyzer.getState().paused).toBe(false);
    expect(t.engine.fens).toHaveLength(2);
    expect(t.engine.fens[1]).toBe(t.engine.fens[0]);
    t.engine.manual = false;
    t.engine.release();
    await t.idle();
    expect(t.reports.has('g1')).toBe(true);
  });
  it('does not start searching while the App is hidden', async () => {
    const t = setup([game('g1')], { hidden: true });
    t.analyzer.enqueue(['g1']);
    await tick();
    expect(t.engine.fens).toHaveLength(0);
    t.setHidden(false);
    await t.idle();
    expect(t.reports.has('g1')).toBe(true);
  });
  it('skips games flagged unanalysable and continues with the next', async () => {
    const t = setup([game('bad', { pgnUnreadable: true }), game('junk', { pgn: 'not a pgn at all ???' }), game('g2')]);
    t.analyzer.enqueue(['bad', 'junk', 'g2']);
    await t.idle();
    expect(t.analyzer.getState().skipped).toEqual(['bad', 'junk']);
    expect([...t.reports.keys()]).toEqual(['g2']);
  });
  it('stops the queue with the engine-start message and Retry continues it', async () => {
    const t = setup([game('g1'), game('g2')]);
    t.engine.failWith = new EngineStartError('no wasm');
    t.analyzer.enqueue(['g1', 'g2']);
    await t.idle();
    expect(t.analyzer.getState().error).toEqual({ kind: 'engine-start', message: 'The analysis engine could not start on this device.' });
    expect(t.reports.size).toBe(0);
    t.engine.failWith = null;
    t.analyzer.retry();
    await t.idle();
    expect([...t.reports.keys()].sort()).toEqual(['g1', 'g2']);
    expect(t.analyzer.getState().error).toBeNull();
  });
  it('stops with the "stopped responding" message after the engine gives up', async () => {
    const t = setup([game('g1')]);
    t.engine.failWith = new EngineStopped('x');
    t.analyzer.enqueue(['g1']);
    await t.idle();
    expect(t.analyzer.getState().error?.kind).toBe('engine-stopped');
  });
  it('stops the queue on a write failure and keeps what was stored', async () => {
    const t = setup([game('g1'), game('g2')]);
    t.flags.failEvalWrite = true;
    t.analyzer.enqueue(['g1', 'g2']);
    await t.idle();
    expect(t.analyzer.getState().error?.kind).toBe('write');
    expect(t.analyzer.getState().queue).toEqual([]);
    expect(t.reports.size).toBe(0);
  });
  it('records a per-game error for an unexpected failure and carries on', async () => {
    const t = setup([game('g1'), game('g2')]);
    const original = t.engine.analyse.bind(t.engine);
    let first = true;
    t.engine.analyse = (fen: string) => {
      if (first) {
        first = false;
        return Promise.reject(new Error('weird'));
      }
      return original(fen);
    };
    t.analyzer.enqueue(['g1', 'g2']);
    await t.idle();
    expect(t.analyzer.getState().gameErrors).toEqual({ g1: 'weird' });
    expect(t.reports.has('g2')).toBe(true);
    expect(t.reports.has('g1')).toBe(false);
  });
});
