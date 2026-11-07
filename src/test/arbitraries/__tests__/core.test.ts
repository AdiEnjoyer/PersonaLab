import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arbEpoch, arbImageBytes, arbLocalDate, arbText } from '../core';
import { isLocalDate } from '../../../core/time/localDate';

describe('shared core generators', () => {
  it('arbLocalDate yields valid dates from 2020-01-01 to 2035-12-31', () => {
    fc.assert(
      fc.property(arbLocalDate, (d) => isLocalDate(d) && d >= '2020-01-01' && d <= '2035-12-31'),
    );
  });

  it('arbEpoch yields timestamps in 2020–2035', () => {
    fc.assert(
      fc.property(arbEpoch, (t) => {
        const y = new Date(t).getFullYear();
        return Number.isInteger(t) && y >= 2020 && y <= 2035;
      }),
    );
  });

  it('arbText respects its length bounds in units', () => {
    fc.assert(
      fc.property(arbText(1, 5), (s) => s.length >= 1 && typeof s === 'string'),
    );
    const samples = fc.sample(arbText(0, 50), { numRuns: 300, seed: 1 }).join('');
    expect(samples).toMatch(/[\u05d0-\u05ea]/);
    expect(samples).toMatch(/\p{M}/u);
  });

  it('arbImageBytes yields up to 4096 bytes', () => {
    fc.assert(fc.property(arbImageBytes, (b) => b instanceof Uint8Array && b.length <= 4096));
  });
});
