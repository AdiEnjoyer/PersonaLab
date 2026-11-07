/**
 * Relative closeness: |x − y| ≤ t × max(|x|, |y|).
 * Two zeros are close for any t ≥ 0.
 */
export const relClose = (x: number, y: number, t: number): boolean =>
  Math.abs(x - y) <= t * Math.max(Math.abs(x), Math.abs(y));
