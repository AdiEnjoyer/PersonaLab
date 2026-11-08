import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { ANALYSER_VERSION, ANALYSIS_DEPTH } from '../../constants';
import type { GameReport } from '../../logic/analysis/report';
import type { EvalRecord, GameRecord } from '../../types';
import { isOutdated, readEvals, readPatternReport, readReport, readReportSummaries, saveEval, saveReport } from '../analysisRepo';
import { CHESS_TABLES } from '../backup';
const ev = (gameId: string, ply: number, over: Partial<EvalRecord> = {}): EvalRecord => ({
  gameId,
  depth: ANALYSIS_DEPTH,
  version: ANALYSER_VERSION,
  ply,
  eval: { kind: 'cp', cp: ply },
  bestUci: 'e2e4',
  ...over,
});
const report = (gameId: string, over: Partial<GameReport> = {}): GameReport => ({
  gameId,
  depth: ANALYSIS_DEPTH,
  version: ANALYSER_VERSION,
  createdAt: 1,
  counts: { inaccuracy: 1, mistake: 0, blunder: 2 },
  labels: [],
  keyMistakes: [],
  detections: [],
  tipIds: [],
  band: '1000–1199',
  ...over,
});
const game = (id: string, over: Partial<GameRecord> = {}): GameRecord => ({
  id,
  idemKey: id,
  pgn: '1. e4 *',
  timeClass: 'rapid',
  timeControl: '600',
  endTime: Number(id.replace(/\D/g, '')) || 1,
  rated: true,
  white: { username: 'adi', result: 'win' },
  black: { username: 'bob', result: 'resigned' },
  syncedFor: 'adi',
  ownerColour: 'w',
  ownerResult: 'loss',
  pgnUnreadable: false,
  ...over,
});
beforeEach(async () => {
  await withFreshDb(async () => undefined);
});
describe('analysisRepo', () => {
  it('saves evaluations idempotently and reads only the current depth and version', async () => {
    await saveEval(ev('g', 0));
    await saveEval(ev('g', 0));
    await saveEval(ev('g', 1));
    await saveEval(ev('g', 2, { version: ANALYSER_VERSION + 1 }));
    await saveEval(ev('other', 0));
    const evals = await readEvals('g');
    expect([...evals.keys()].sort()).toEqual([0, 1]);
    expect(await db.table(CHESS_TABLES.evals).count()).toBe(4);
  });
  it('replaces the report and deletes the evaluations of other versions in one go', async () => {
    await saveEval(ev('g', 0, { version: ANALYSER_VERSION - 1 }));
    await saveEval(ev('g', 0));
    await db.table(CHESS_TABLES.reports).put(report('g', { version: ANALYSER_VERSION - 1 }));
    expect((await readReportSummaries()).get('g')?.outdated).toBe(true);
    await saveReport(report('g'));
    await saveReport(report('g'));
    expect(await db.table(CHESS_TABLES.reports).count()).toBe(1);
    expect(isOutdated((await readReport('g'))!)).toBe(false);
    expect(await db.table(CHESS_TABLES.evals).count()).toBe(1);
  });
  it('builds the pattern report from cached reports of existing games', async () => {
    for (let i = 1; i <= 5; i++) {
      await db.table(CHESS_TABLES.games).put(game(`g${i}`));
      await saveReport(report(`g${i}`, { detections: [{ detector: 'hanging-piece', ply: 41, fullMove: 21, phase: 'middlegame', explanation: 'x' }] }));
    }
    await saveReport(report('ghost'));
    const out = await readPatternReport(20, 'all');
    expect(out.kind).toBe('patterns');
    if (out.kind === 'patterns') {
      expect(out.patterns).toHaveLength(1);
      expect(out.patterns[0]).toMatchObject({ detector: 'hanging-piece', numerator: 5, denominator: 5, basis: 'losses' });
    }
    expect(await readPatternReport(20, 'blitz')).toEqual({ kind: 'too-few', n: 0 });
  });
});
