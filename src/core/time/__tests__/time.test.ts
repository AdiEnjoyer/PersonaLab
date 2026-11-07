import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  daysInMonth,
  isLocalDate,
  parseLocalDate,
  startOfLocalDate,
  toLocalDate,
} from '../localDate';
import { monthsBack } from '../monthRange';
import { formatClock, formatDurationMinutes } from '../format';

const HOUR = 3_600_000;

describe('test environment', () => {
  it('runs in Asia/Jerusalem', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Jerusalem');
  });
});

describe('Local_Date helpers', () => {
  it('validates and parses YYYY-MM-DD', () => {
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2025-02-29')).toBe(false);
    expect(isLocalDate('2025-13-01')).toBe(false);
    expect(isLocalDate('2025-1-01')).toBe(false);
    expect(parseLocalDate('2025-03-31')).toEqual({ year: 2025, month: 3, day: 31 });
    expect(() => parseLocalDate('31/03/2025')).toThrow(RangeError);
  });

  it('knows month lengths, including leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2025, 12)).toBe(31);
    expect(daysInMonth(2025, 4)).toBe(30);
  });

  it('reads the local calendar date of a timestamp', () => {
    // 2025-06-30T21:30Z is 00:30 on 1 July in Israel (UTC+3 in summer).
    expect(toLocalDate(Date.UTC(2025, 5, 30, 21, 30))).toBe('2025-07-01');
    // 2025-01-15T21:59Z is 23:59 on 15 January (UTC+2 in winter).
    expect(toLocalDate(Date.UTC(2025, 0, 15, 21, 59))).toBe('2025-01-15');
  });

  it('adds days across the Asia/Jerusalem DST changes', () => {
    // Clocks move forward on Friday 2025-03-28 at 02:00.
    expect(addDays('2025-03-27', 1)).toBe('2025-03-28');
    expect(addDays('2025-03-27', 2)).toBe('2025-03-29');
    expect(addDays('2025-03-29', -2)).toBe('2025-03-27');
    // Clocks move back on Sunday 2025-10-26 at 02:00.
    expect(addDays('2025-10-25', 1)).toBe('2025-10-26');
    expect(addDays('2025-10-25', 2)).toBe('2025-10-27');
    // Month, year and leap-day boundaries.
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(addDays('2025-01-01', 0)).toBe('2025-01-01');
  });

  it('counts calendar days between dates', () => {
    expect(daysBetween('2025-03-27', '2025-03-29')).toBe(2);
    expect(daysBetween('2025-10-27', '2025-10-25')).toBe(-2);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
    expect(daysBetween('2020-01-01', '2035-12-31')).toBe(5843);
  });

  it('finds local midnight, including on DST change days', () => {
    expect(startOfLocalDate('2025-01-15')).toBe(Date.UTC(2025, 0, 14, 22));
    expect(startOfLocalDate('2025-07-01')).toBe(Date.UTC(2025, 5, 30, 21));
    // The spring-forward day is 23 h long, the fall-back day 25 h.
    expect(startOfLocalDate('2025-03-29') - startOfLocalDate('2025-03-28')).toBe(23 * HOUR);
    expect(startOfLocalDate('2025-10-27') - startOfLocalDate('2025-10-26')).toBe(25 * HOUR);
    expect(toLocalDate(startOfLocalDate('2025-03-28'))).toBe('2025-03-28');
    expect(toLocalDate(startOfLocalDate('2025-03-29') - 1)).toBe('2025-03-28');
  });
});

describe('monthsBack', () => {
  it('keeps the day of the month when it exists', () => {
    expect(monthsBack('2025-05-15', 1)).toBe('2025-04-15');
    expect(monthsBack('2025-05-15', 3)).toBe('2025-02-15');
    expect(monthsBack('2025-05-15', 12)).toBe('2024-05-15');
    expect(monthsBack('2025-02-10', 6)).toBe('2024-08-10');
    expect(monthsBack('2025-05-15', 0)).toBe('2025-05-15');
  });

  it("uses that month's last day when the day does not exist", () => {
    expect(monthsBack('2025-03-31', 1)).toBe('2025-02-28');
    expect(monthsBack('2024-03-31', 1)).toBe('2024-02-29');
    expect(monthsBack('2025-07-31', 1)).toBe('2025-06-30');
    expect(monthsBack('2025-12-31', 3)).toBe('2025-09-30');
  });

  it('rejects a negative or fractional n', () => {
    expect(() => monthsBack('2025-03-31', -1)).toThrow(RangeError);
    expect(() => monthsBack('2025-03-31', 1.5)).toThrow(RangeError);
  });
});

describe('formatClock', () => {
  it('uses M:SS below one hour and H:MM:SS from one hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(3599)).toBe('59:59');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(360_000)).toBe('100:00:00');
  });

  it('truncates fractions and shows negative input as 0:00', () => {
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('formatDurationMinutes', () => {
  it('formats minutes below and above one hour', () => {
    expect(formatDurationMinutes(45 * 60_000)).toBe('45 min');
    expect(formatDurationMinutes(65 * 60_000)).toBe('1 h 05 min');
    expect(formatDurationMinutes(60 * 60_000)).toBe('1 h 00 min');
    expect(formatDurationMinutes(135 * 60_000)).toBe('2 h 15 min');
  });

  it('rounds to whole minutes half away from zero', () => {
    expect(formatDurationMinutes(29_999)).toBe('0 min');
    expect(formatDurationMinutes(30_000)).toBe('1 min');
    expect(formatDurationMinutes(59 * 60_000 + 30_000)).toBe('1 h 00 min');
    expect(formatDurationMinutes(-1)).toBe('0 min');
  });
});
