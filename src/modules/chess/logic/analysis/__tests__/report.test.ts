import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { DetectorId, Tip } from '../../../types';
import type { Detection, EvalInfo } from '../detectors';
import { buildPositions } from '../positions';
import { buildReport, selectReportTips, type ReportInput } from '../report';

const tip = (id: string, band: Tip['band'], detectors: DetectorId[] = []): Tip => ({ id, band, topics: ['tactics'], title: id, body: id, detectors });
const BAND = '1000–1199' as const;
const TIPS: Tip[] = [
  tip('t1', BAND, ['early-queen']),
  tip('t2', BAND),
  tip('t3', BAND, ['hanging-piece']),
  tip('t4', BAND),
  tip('o1', '1200–1399', ['early-queen']),
];
const det = (detector: DetectorId): Detection => ({ detector, ply: 1, fullMove: 1, phase: 'opening', explanation: '' });

describe('selectReportTips', () => {
  it('takes 3 tips with detections (tagged first, then untagged) and 2 without', () => {
    expect(selectReportTips(TIPS, BAND, [det('early-queen')])).toEqual(['t1', 't2', 't4']);
    expect(selectReportTips(TIPS, BAND, [])).toEqual(['t2', 't4']);
  });
  it('orders detectors by detection count, then detector order, and never repeats a tip', () => {
    expect(selectReportTips(TIPS, BAND, [det('hanging-piece'), det('early-queen'), det('early-queen')])).toEqual(['t1', 't3', 't2']);
    expect(selectReportTips(TIPS, BAND, [det('hanging-piece'), det('early-queen')])).toEqual(['t3', 't1', 't2']);
  });
  it('is deterministic and falls back to fewer tips when the band is small', () => {
    expect(selectReportTips(TIPS, BAND, [det('early-queen')])).toEqual(selectReportTips([...TIPS], BAND, [det('early-queen')]));
    expect(selectReportTips(TIPS, '1200–1399', [])).toEqual(['o1']);
  });
});

describe('buildReport', () => {
  const chess = new Chess();
  for (const san of ['e4', 'e5', 'Qh5', 'Nc6']) chess.move(san);
  const positions = buildPositions(chess.pgn())!;
  const evals: Array<EvalInfo | undefined> = [
    { kind: 'cp', cp: 20, bestUci: 'e2e4' },
    { kind: 'cp', cp: -20 },
    { kind: 'cp', cp: 30, bestUci: 'g1f3', pv: ['g1f3', 'b8c6', 'f1c4'] },
    { kind: 'cp', cp: 150, bestUci: 'g8f6' },
    undefined,
  ];
  const input: ReportInput = {
    gameId: 'g1',
    depth: 12,
    version: 1,
    createdAt: 5,
    positions,
    evals,
    clocks: [],
    timeControl: '600',
    timeClass: 'rapid',
    ownerColour: 'w',
    ownerResult: 'loss',
    tips: TIPS,
    band: BAND,
  };

  it('counts Owner labels, finds the key mistake and picks tips', () => {
    const r = buildReport(input);
    expect(r.counts).toEqual({ inaccuracy: 0, mistake: 0, blunder: 1 });
    expect(r.keyMistakes).toHaveLength(1);
    expect(r.keyMistakes[0]).toMatchObject({ ply: 3, moveNo: '2.', san: 'Qh5', better: ['Nf3', 'Nc6', 'Bc4'], detectors: ['early-queen'] });
    expect(r.keyMistakes[0]!.wBefore).toBe(53);
    expect(r.keyMistakes[0]!.wAfter).toBe(37);
    expect(r.keyMistakes[0]!.explanation.length).toBeGreaterThan(0);
    expect(r.labels).toEqual([expect.objectContaining({ ply: 3, label: 'blunder', bestSan: 'Nf3' })]);
    expect(r.detections.map((d) => d.detector)).toEqual(['early-queen']);
    expect(r.tipIds).toEqual(['t1', 't2', 't4']);
    expect(r.band).toBe(BAND);
  });

  it('is deterministic, and a Black Owner is not charged for White moves', () => {
    expect(buildReport(input)).toEqual(buildReport(input));
    const black = buildReport({ ...input, ownerColour: 'b' });
    expect(black.counts).toEqual({ inaccuracy: 0, mistake: 0, blunder: 0 });
    expect(black.keyMistakes).toEqual([]);
    expect(black.tipIds).toEqual(['t2', 't4']);
  });
});
