// Feature: personal-lab, Property 10: Backup file name format
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { backupFileName } from '../filename';

const NAME = /^personallab-backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.json$/;

/**
 * Export instants over four-digit years, weighted towards the App's lifetime and the Asia/Jerusalem DST
 * changes, where local and UTC hours differ by 2 or 3.
 */
const arbInstant = fc.oneof(
  fc.date({ min: new Date('1000-01-01T00:00:00Z'), max: new Date('9999-12-30T00:00:00Z'), noInvalidDate: true }),
  fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2036-01-01T00:00:00Z'), noInvalidDate: true }),
  fc
    .record({ year: fc.integer({ min: 2020, max: 2035 }), month: fc.constantFrom(2, 9), day: fc.integer({ min: 20, max: 31 }), offset: fc.integer({ min: -7_200_000, max: 7_200_000 }) })
    .map(({ year, month, day, offset }) => new Date(Date.UTC(year, month, day, 0) + offset)),
);

describe('backupFileName', () => {
  it('matches the pattern and carries the zero-padded local date and time of the export instant', () => {
    fc.assert(
      fc.property(arbInstant, (instant) => {
        const name = backupFileName(instant);
        const match = NAME.exec(name);
        expect(match).not.toBeNull();
        const [, year, month, day, hour, minute] = match!.map(Number);
        expect(year).toBe(instant.getFullYear());
        expect(month).toBe(instant.getMonth() + 1);
        expect(day).toBe(instant.getDate());
        expect(hour).toBe(instant.getHours());
        expect(minute).toBe(instant.getMinutes());
        // Every field is zero-padded to its width.
        expect(name.slice(19, 23)).toBe(String(instant.getFullYear()).padStart(4, '0'));
        expect(name.slice(24, 26)).toBe(String(instant.getMonth() + 1).padStart(2, '0'));
        expect(name.slice(27, 29)).toBe(String(instant.getDate()).padStart(2, '0'));
        expect(name.slice(30, 34)).toBe(`${String(instant.getHours()).padStart(2, '0')}${String(instant.getMinutes()).padStart(2, '0')}`);
      }),
      { numRuns: 1000 },
    );
  }, 60_000);
});
