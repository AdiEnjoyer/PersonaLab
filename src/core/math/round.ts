/**
 * Round half away from zero (Conventions: Rounding).
 *
 * Uses the exponent-string method so decimal inputs round exactly:
 * `1.005 * 100` is `100.49999…` in binary floating point, but
 * `Number('1.005e2')` is exactly `100.5`.
 *
 * `decimals` must be an integer; negative values round to tens, hundreds, …
 * Non-finite inputs are returned unchanged. The result is never `-0`.
 */
export function round(x: number, decimals = 0): number {
  if (!Number.isInteger(decimals)) {
    throw new RangeError(`round: decimals must be an integer, got ${decimals}`);
  }
  if (!Number.isFinite(x)) return x;
  if (x === 0) return 0;

  const shifted = Math.round(Number(shiftExponent(String(Math.abs(x)), decimals)));
  const magnitude = Number(shiftExponent(String(shifted), -decimals));
  const result = Math.sign(x) * magnitude;
  return result === 0 ? 0 : result;
}

/**
 * Multiply the decimal number written in `numeric` by 10^k by editing its
 * exponent, so no binary multiplication error is introduced. `numeric` is the
 * `String()` form of a non-negative finite number, which may already use
 * exponent notation (`1e-7`, `1.5e+21`).
 */
function shiftExponent(numeric: string, k: number): string {
  const e = numeric.indexOf('e');
  if (e === -1) return `${numeric}e${k}`;
  const mantissa = numeric.slice(0, e);
  const exponent = Number(numeric.slice(e + 1));
  return `${mantissa}e${exponent + k}`;
}
