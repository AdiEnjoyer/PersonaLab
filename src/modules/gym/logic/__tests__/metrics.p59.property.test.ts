// Feature: personal-lab, Property 59: Volume additivity
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Session, SetRecord } from '../../types';
import { sessionVolume, sumVolume, type CompletedSet } from '../metrics';

const arbSet = fc
  .record({ weight: fc.integer({ min: 0, max: 100_000 }).map((n) => n / 100), reps: fc.integer({ min: 1, max: 100 }) })
  .map(({ weight, reps }, ): SetRecord => ({ id: 's', idemKey: 'k', weight, reps, weightSource: 'owner', repsSource: 'owner', completed: true, completedAt: 1 }));

const sessionOf = (sets: SetRecord[]): Session => ({
  id: 'x',
  status: 'finished',
  startedAt: 0,
  finishedAt: 1,
  lastChangeAt: 0,
  entries: [{ entryId: 'e', exerciseId: 'ex', sets }],
});

describe('Property 59', () => {
  it('is 0 for an empty list, order independent and additive over partitions (0.001 kg)', () => {
    fc.assert(
      fc.property(fc.array(arbSet, { maxLength: 200 }), fc.nat(), fc.integer(), (sets, cut, seed) => {
        expect(sessionVolume(sessionOf([]))).toBe(0);
        const total = sessionVolume(sessionOf(sets));
        const k = sets.length === 0 ? 0 : cut % (sets.length + 1);
        const parts = sessionVolume(sessionOf(sets.slice(0, k))) + sessionVolume(sessionOf(sets.slice(k)));
        expect(Math.abs(total - parts)).toBeLessThanOrEqual(0.001);
        const r = sets.length === 0 ? 0 : Math.abs(seed) % sets.length;
        const permuted = [...sets.slice(r), ...sets.slice(0, r)].reverse();
        expect(Math.abs(sessionVolume(sessionOf(permuted)) - total)).toBeLessThanOrEqual(0.001);
        expect(Math.abs(sumVolume(sets as CompletedSet[]) - total)).toBeLessThanOrEqual(0.001);
      }),
      { numRuns: 200 },
    );
  }, 60_000);
});
