// Feature: personal-lab, Property 151: Pattern share bounds and dilution
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DETECTOR_IDS } from '../../../constants';
import { patternReport, patternShares, type PatternReportEntry } from '../patterns';

const arbEntry = (i: number): fc.Arbitrary<PatternReportEntry> =>
  fc.record({
    gameId: fc.constant(`g${i}`),
    endTime: fc.constant(i),
    timeClass: fc.constant('rapid'),
    ownerResult: fc.constantFrom('win', 'loss', 'draw', 'unknown'),
    detections: fc.array(fc.record({ detector: fc.constantFrom(...DETECTOR_IDS), fullMove: fc.integer({ min: 1, max: 100 }) }), { maxLength: 20 }),
  });

const arbEntries = fc.integer({ min: 0, max: 200 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => arbEntry(i))));

describe('pattern shares', () => {
  it('stay within 0–100, and a game without detections never raises a share', () => {
    fc.assert(
      fc.property(arbEntries, fc.constantFrom('win', 'loss', 'draw', 'unknown'), (entries, result) => {
        const before = patternShares(entries);
        for (const s of before) {
          expect(s.gameShare).toBeGreaterThanOrEqual(0);
          expect(s.gameShare).toBeLessThanOrEqual(100);
          if (s.lossShare !== undefined) {
            expect(s.lossShare).toBeGreaterThanOrEqual(0);
            expect(s.lossShare).toBeLessThanOrEqual(100);
          }
        }
        const extra: PatternReportEntry = { gameId: 'extra', endTime: -1, timeClass: 'rapid', ownerResult: result, detections: [] };
        const after = patternShares([...entries, extra]);
        before.forEach((b, k) => {
          const a = after[k]!;
          if (entries.length > 0) expect(a.gameShare).toBeLessThanOrEqual(b.gameShare + 1e-9);
          if (b.lossShare !== undefined) expect(a.lossShare!).toBeLessThanOrEqual(b.lossShare + 1e-9);
        });
        const out = patternReport({ reports: entries, scope: 'all', timeClass: 'all' });
        if (out.kind === 'patterns') for (const p of out.patterns) expect(p.share).toBeGreaterThanOrEqual(0), expect(p.share).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
