import { ANALYSER_VERSION, ANALYSIS_DEPTH } from '../constants';
import { buildPositions } from '../logic/analysis/positions';
import { buildReport, type GameReport } from '../logic/analysis/report';
import type { EvalInfo } from '../logic/analysis/detectors';
import { parseClocks } from '../logic/gameView';
import type { EvalRecord, GameRecord, RatingBand, Tip } from '../types';
import { EngineCancelled, EngineStartError, EngineStopped, type EngineResult } from './client';
/** The part of the engine client the analyzer uses. */
export interface EnginePort {
  analyse(fen: string, depth: number): Promise<EngineResult>;
  stop(): Promise<void>;
  newGame?(): void;
}
export interface AnalysisStore {
  readEvals(gameId: string): Promise<Map<number, EvalRecord>>;
  saveEval(record: EvalRecord): Promise<void>;
  saveReport(report: GameReport): Promise<void>;
}
export interface VisibilitySource {
  hidden(): boolean;
  subscribe(cb: () => void): () => void;
}
export interface AnalyzerDeps {
  engine: EnginePort;
  store: AnalysisStore;
  loadGame(id: string): Promise<GameRecord | undefined>;
  loadTips(): Promise<Tip[]>;
  readBand(): Promise<RatingBand>;
  now(): number;
  visibility: VisibilitySource;
}
export type AnalyzerError =
  | { kind: 'engine-start'; message: string }
  | { kind: 'engine-stopped'; message: string }
  | { kind: 'write'; message: string };
export const ENGINE_START_MESSAGE = 'The analysis engine could not start on this device.';
export const ENGINE_STOPPED_MESSAGE = 'Analysis stopped: the engine stopped responding.';
export const WRITE_FAILED_MESSAGE = 'Analysis stopped: the result could not be saved.';
export interface AnalyzerState {
  running: boolean;
  paused: boolean;
  /** Games waiting, in order, not counting the current one. */
  queue: string[];
  current: { gameId: string; done: number; total: number } | null;
  /** Failure that stopped the queue; Retry re-queues the games that were not finished. */
  error: AnalyzerError | null;
  /** Per-game failures, by game id (Retry re-queues one). */
  gameErrors: Record<string, string>;
  /** Games skipped because their PGN cannot be analysed. */
  skipped: string[];
  /** Games whose report was stored in this run, in order. */
  finished: string[];
}
class StoreFailure extends Error {
  override name = 'StoreFailure';
}
class Cancelled extends Error {
  override name = 'Cancelled';
}
const initial = (): AnalyzerState => ({ running: false, paused: false, queue: [], current: null, error: null, gameErrors: {}, skipped: [], finished: [] });
/** Evaluates games one at a time with the engine, storing each position as it arrives (R55, R58, R60). */
export class GameAnalyzer {
  private state: AnalyzerState = initial();
  private readonly listeners = new Set<() => void>();
  private runPromise: Promise<void> | null = null;
  private cancelled = false;
  private resumeWaiters: Array<() => void> = [];
  private unsubscribe: (() => void) | null = null;
  /** Games not finished when the queue stopped on an error. */
  private unfinished: string[] = [];
  constructor(private readonly deps: AnalyzerDeps) {}
  getState = (): AnalyzerState => this.state;
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  private set(patch: Partial<AnalyzerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }
  /** Adds games to the queue (newest first as given); games already queued or running are ignored. */
  enqueue(gameIds: readonly string[]): void {
    const known = new Set([...this.state.queue, ...(this.state.current ? [this.state.current.gameId] : [])]);
    const fresh = gameIds.filter((id, i) => !known.has(id) && gameIds.indexOf(id) === i);
    if (fresh.length === 0) return;
    const gameErrors = { ...this.state.gameErrors };
    for (const id of fresh) delete gameErrors[id];
    this.cancelled = false;
    this.set({ queue: [...this.state.queue, ...fresh], error: null, gameErrors });
    if (this.runPromise === null) this.runPromise = this.run().finally(() => (this.runPromise = null));
  }
  /** Re-queues the games that were not finished when the queue stopped on an error (R55.8, R55.9). */
  retry(): void {
    const ids = this.unfinished;
    this.unfinished = [];
    this.enqueue(ids);
  }
  /** Stops the search within 1 s, clears the queue and keeps stored evaluations (R55.6). */
  async cancel(): Promise<void> {
    this.cancelled = true;
    this.unfinished = [];
    this.set({ queue: [] });
    this.releaseWaiters();
    await this.deps.engine.stop();
    await this.runPromise;
  }
  private releaseWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
  }
  private onVisibility = (): void => {
    if (this.deps.visibility.hidden()) {
      if (!this.state.running || this.state.paused) return;
      this.set({ paused: true });
      void this.deps.engine.stop();
    } else if (this.state.paused) {
      this.set({ paused: false });
      this.releaseWaiters();
    }
  };
  private async waitWhilePaused(): Promise<void> {
    while (this.state.paused && !this.cancelled) await new Promise<void>((resolve) => this.resumeWaiters.push(resolve));
    if (this.cancelled) throw new Cancelled();
  }
  private async run(): Promise<void> {
    this.unsubscribe = this.deps.visibility.subscribe(this.onVisibility);
    this.set({ running: true, paused: this.deps.visibility.hidden() });
    try {
      while (this.state.queue.length > 0 && !this.cancelled) {
        const [id, ...rest] = this.state.queue as [string, ...string[]];
        this.set({ queue: rest, current: { gameId: id, done: 0, total: 0 } });
        try {
          await this.analyseGame(id);
        } catch (e) {
          if (e instanceof Cancelled) break;
          if (e instanceof EngineStartError) return this.stopQueue(id, { kind: 'engine-start', message: ENGINE_START_MESSAGE });
          if (e instanceof EngineStopped) return this.stopQueue(id, { kind: 'engine-stopped', message: ENGINE_STOPPED_MESSAGE });
          if (e instanceof StoreFailure) return this.stopQueue(id, { kind: 'write', message: WRITE_FAILED_MESSAGE });
          this.set({ gameErrors: { ...this.state.gameErrors, [id]: e instanceof Error ? e.message : 'The game could not be analysed.' } });
        }
      }
    } finally {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.resumeWaiters = [];
      this.set({ running: false, paused: false, current: null, ...(this.cancelled ? { queue: [] } : {}) });
    }
  }
  private stopQueue(failed: string, error: AnalyzerError): void {
    this.unfinished = [failed, ...this.state.queue];
    this.set({ queue: [], error });
  }
  private async store<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      throw new StoreFailure();
    }
  }
  private async analyseGame(id: string): Promise<void> {
    const game = await this.deps.loadGame(id);
    const positions = game && !game.pgnUnreadable ? buildPositions(game.pgn) : null;
    if (game === undefined || positions === null) {
      this.set({ skipped: [...this.state.skipped, id] });
      return;
    }
    const total = positions.length;
    const stored = await this.store(() => this.deps.store.readEvals(id));
    const evals: Array<EvalInfo | undefined> = new Array<EvalInfo | undefined>(total).fill(undefined);
    const remember = (rec: EvalRecord): void => {
      evals[rec.ply] = { ...rec.eval, ...(rec.bestUci !== undefined ? { bestUci: rec.bestUci } : {}), ...(rec.pv !== undefined ? { pv: rec.pv } : {}) };
    };
    for (const [ply, rec] of stored) if (ply < total) remember(rec);
    const count = (): number => evals.filter((e) => e !== undefined).length;
    this.set({ current: { gameId: id, done: count(), total } });
    this.deps.engine.newGame?.();
    for (let idx = 0; idx < total; idx++) {
      if (evals[idx] !== undefined) continue;
      const pos = positions[idx]!;
      let rec: EvalRecord;
      if (pos.terminal !== undefined) {
        rec = { gameId: id, depth: ANALYSIS_DEPTH, version: ANALYSER_VERSION, ply: idx, eval: pos.terminal === 'checkmate' ? { kind: 'mated' } : { kind: 'draw' } };
      } else {
        const result = await this.searchWithPause(pos.fen);
        rec = {
          gameId: id,
          depth: ANALYSIS_DEPTH,
          version: ANALYSER_VERSION,
          ply: idx,
          eval: result.eval,
          bestUci: result.bestUci,
          pv: result.pv,
        };
      }
      await this.store(() => this.deps.store.saveEval(rec));
      remember(rec);
      this.set({ current: { gameId: id, done: count(), total } });
    }
    const [tips, band] = await Promise.all([this.deps.loadTips(), this.deps.readBand()]);
    const report = buildReport({
      gameId: id,
      depth: ANALYSIS_DEPTH,
      version: ANALYSER_VERSION,
      createdAt: this.deps.now(),
      positions,
      evals,
      clocks: [undefined, ...parseClocks(game.pgn)],
      timeControl: game.timeControl,
      timeClass: game.timeClass,
      ownerColour: game.ownerColour,
      ownerResult: game.ownerResult,
      tips,
      band,
    });
    await this.store(() => this.deps.store.saveReport(report));
    this.set({ finished: [...this.state.finished, id] });
  }
  /** One engine search; a stop caused by the App going hidden waits for the App to be visible and searches again. */
  private async searchWithPause(fen: string): Promise<EngineResult> {
    for (;;) {
      await this.waitWhilePaused();
      try {
        return await this.deps.engine.analyse(fen, ANALYSIS_DEPTH);
      } catch (e) {
        if (!(e instanceof EngineCancelled)) throw e;
        if (this.cancelled) throw new Cancelled();
        if (!this.state.paused) throw e;
      }
    }
  }
}
