import { describe, expect, it } from 'vitest';
import type { DetectorId, OwnerResult } from '../../../types';
import { patternReport, type PatternReportEntry } from '../patterns';

const game = (n: number, result: OwnerResult, detections: Array<[DetectorId, number]> = []): PatternReportEntry => ({
  gameId: `g${n}`,
  endTime: n,
  timeClass: 'rapid',
  ownerResult: result,
  detections: detections.map(([detector, fullMove]) => ({ detector, fullMove })),
});

describe('patternReport', () => {
  it('needs at least 5 games', () => {
    expect(patternReport({ reports: [game(1, 'loss'), game(2, 'loss')], scope: 'all', timeClass: 'all' })).toEqual({ kind: 'too-few', n: 2 });
  });

  it('reports a loss-share pattern with wording, themes and tips action', () => {
    const reports = [
      ...[1, 2, 3, 4].map((n) => game(n, 'loss', [['hanging-piece', 25]])),
      ...[5, 6, 7, 8, 9, 10].map((n) => game(n, 'loss', [['early-queen', 3]])),
      game(11, 'win'),
    ];
    const out = patternReport({ reports, scope: 'all', timeClass: 'all' });
    if (out.kind !== 'patterns') throw new Error('expected patterns');
    const hang = out.patterns.find((p) => p.detector === 'hanging-piece')!;
    expect(hang).toMatchObject({ basis: 'losses', numerator: 4, denominator: 10, bucket: 2, themes: ['hangingPiece'], action: 'practice' });
    expect(hang.text).toBe('You hang pieces in moves 21–30 in 40 % of losses (4 of 10)');
    const queen = out.patterns.find((p) => p.detector === 'early-queen')!;
    expect(queen.action).toBe('read-tips');
    expect(out.patterns[0]!.detector).toBe('early-queen');
  });

  it('hides shares under 25 % or with fewer than 3 games, and honours scope', () => {
    const reports = [game(1, 'loss', [['hanging-piece', 40]]), game(2, 'loss', [['hanging-piece', 40]]), ...[3, 4, 5, 6, 7].map((n) => game(n, 'win'))];
    expect(patternReport({ reports, scope: 'all', timeClass: 'all' })).toEqual({ kind: 'patterns', patterns: [] });
    expect(patternReport({ reports, scope: 20, timeClass: 'blitz' })).toEqual({ kind: 'too-few', n: 0 });
  });
});
