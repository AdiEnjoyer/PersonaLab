import { addDays, type LocalDate } from '../../../core/time/localDate';
import { SM2 } from '../constants';

/** SM-2 state of a Repertoire_Position. E is the easiness factor in hundredths (250 = 2.5). */
export interface SrsState {
  E: number;
  n: number;
  I: number;
  due?: LocalDate;
}

export const SRS_INITIAL: SrsState = { E: SM2.E_INIT, n: 0, I: 0 };

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** A valid state has an integer E from 130, an integer n from 0, an integer I from 0 to 36,500, and I >= 1 whenever n >= 1 (R53.7). */
export function isValidSrs(s: SrsState): boolean {
  return (
    Number.isInteger(s.E) &&
    s.E >= SM2.E_MIN &&
    Number.isInteger(s.n) &&
    s.n >= 0 &&
    Number.isInteger(s.I) &&
    s.I >= 0 &&
    s.I <= SM2.INTERVAL_CAP &&
    (s.n < 1 || s.I >= 1)
  );
}

/**
 * One SM-2 review with integers only (R53.2 to R53.6). Throws on a quality that is not an integer from 0 to 5 or on
 * an invalid state; the caller then stores nothing.
 */
export function sm2Review(s: SrsState, q: number, reviewDate: LocalDate): SrsState {
  if (!Number.isInteger(q) || q < 0 || q > 5) throw new RangeError(`Invalid quality: ${q}`);
  if (!isValidSrs(s)) throw new RangeError('Invalid SRS state');
  if (q < 3) return { E: s.E, n: 0, I: 1, due: addDays(reviewDate, 1) };
  const interval = s.n === 0 ? 1 : s.n === 1 ? 6 : Math.min(SM2.INTERVAL_CAP, Math.floor((s.I * s.E + 99) / 100));
  const miss = 5 - q;
  const E = Math.max(SM2.E_MIN, s.E + 10 - miss * (8 + miss * 2));
  return { E, n: s.n + 1, I: interval, due: addDays(reviewDate, interval) };
}
