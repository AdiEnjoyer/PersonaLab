import { daysInMonth, formatLocalDate, parseLocalDate, type LocalDate } from './localDate';

/**
 * The Local_Date `n` calendar months before `today` (R25.4, R45.8): the same
 * day of the month, or that month's last day when the day does not exist
 * there. `n` must be a non-negative integer.
 *
 * Example: `monthsBack('2025-03-31', 1) === '2025-02-28'`.
 */
export function monthsBack(today: LocalDate, n: number): LocalDate {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`monthsBack: n must be a non-negative integer, got ${n}`);
  }
  const { year, month, day } = parseLocalDate(today);
  const index = year * 12 + (month - 1) - n;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return formatLocalDate(y, m, Math.min(day, daysInMonth(y, m)));
}
