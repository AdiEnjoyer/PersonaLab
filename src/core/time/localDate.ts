/**
 * Local_Date: the calendar date in the phone's current time zone, written
 * `YYYY-MM-DD`. A day starts at local midnight (Conventions).
 *
 * Calendar arithmetic (`addDays`, `daysBetween`) runs on `Date.UTC` values,
 * which have no daylight-saving changes, so every day is exactly 24 h there.
 * Only `toLocalDate` and `startOfLocalDate` touch the local time zone.
 */
export type LocalDate = string;

const MS_PER_DAY = 86_400_000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

/** True when `s` is a real calendar date written `YYYY-MM-DD`. */
export function isLocalDate(s: string): s is LocalDate {
  const m = LOCAL_DATE.exec(s);
  if (m === null) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Split a Local_Date into numbers. Throws `RangeError` on an invalid date. */
export function parseLocalDate(d: LocalDate): DateParts {
  if (!isLocalDate(d)) throw new RangeError(`Invalid Local_Date: ${JSON.stringify(d)}`);
  return { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) };
}

/** Format numbers as `YYYY-MM-DD`. */
export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Number of days in `month` (1–12) of `year`, using the Gregorian calendar. */
export function daysInMonth(year: number, month: number): number {
  return new Date(utcMs(year, month + 1, 0)).getUTCDate();
}

/** Local_Date of an epoch timestamp, read with the local `Date` getters. */
export function toLocalDate(epochMs: number): LocalDate {
  const dt = new Date(epochMs);
  return formatLocalDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** The Local_Date `n` calendar days after `d` (before it when `n` is negative). */
export function addDays(d: LocalDate, n: number): LocalDate {
  const { year, month, day } = parseLocalDate(d);
  const dt = new Date(utcMs(year, month, day + n));
  return formatLocalDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** `b − a` in calendar days. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parseLocalDate(a);
  const pb = parseLocalDate(b);
  return Math.round((utcMs(pb.year, pb.month, pb.day) - utcMs(pa.year, pa.month, pa.day)) / MS_PER_DAY);
}

/** Epoch ms of local midnight at the start of `d`. */
export function startOfLocalDate(d: LocalDate): number {
  const { year, month, day } = parseLocalDate(d);
  const dt = new Date(0);
  dt.setFullYear(year, month - 1, day);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

/** `Date.UTC` that also handles years 0–99 literally (no 1900 offset). */
function utcMs(year: number, month: number, day: number): number {
  const dt = new Date(0);
  dt.setUTCFullYear(year, month - 1, day);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.getTime();
}
