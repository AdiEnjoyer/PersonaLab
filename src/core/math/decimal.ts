/**
 * Decimal validation on the text the Owner entered, never on floats, so that
 * values such as 70.25 (too many decimals) or 3.2 (not a multiple of 0.5) are
 * rejected exactly.
 */

const DECIMAL_TEXT = /^\d+([.,]\d+)?$/;

export interface ParseDecimalOptions {
  /** Largest number of fractional digits accepted (0 accepts integers only). */
  maxDecimals: number;
  /** Accept `,` as the decimal separator as well as `.`. Default `false`. */
  allowComma?: boolean;
}

/**
 * Parse a non-negative decimal written as digits with an optional fractional
 * part (`/^\d+([.,]\d+)?$/` after trimming). Returns `null` when the text does
 * not match, uses a comma without `allowComma`, or has more than
 * `maxDecimals` fractional digits.
 */
export function parseDecimal(text: string, opts: ParseDecimalOptions): number | null {
  const t = text.trim();
  const match = DECIMAL_TEXT.exec(t);
  if (match === null) return null;
  const fraction = match[1];
  if (fraction !== undefined) {
    if (fraction.startsWith(',') && opts.allowComma !== true) return null;
    if (fraction.length - 1 > opts.maxDecimals) return null;
  }
  return Number(t.replace(',', '.'));
}

/**
 * True when `value` is a whole multiple of `step`.
 *
 * - For a number, uses `Math.abs(value / step - Math.round(value / step)) < 1e-9`.
 * - For entered text (`/^\d+([.,]\d+)?$/` after trimming, `.` or `,` as the
 *   separator), the check is exact decimal arithmetic on the digits, so
 *   floating-point error cannot accept or reject a value. Text that is not a
 *   decimal number is not a multiple of anything and returns `false`.
 *
 * `step` must be a finite number greater than 0.
 */
export function isMultipleOfStep(value: number | string, step: number): boolean {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError(`isMultipleOfStep: step must be a positive finite number, got ${step}`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    const q = value / step;
    return Math.abs(q - Math.round(q)) < 1e-9;
  }

  const t = value.trim();
  if (!DECIMAL_TEXT.test(t)) return false;
  const v = textToScaled(t.replace(',', '.'));
  const s = textToScaled(String(step));
  const scale = Math.max(v.scale, s.scale);
  const vi = v.digits * 10n ** BigInt(scale - v.scale);
  const si = s.digits * 10n ** BigInt(scale - s.scale);
  return vi % si === 0n;
}

/**
 * Convert a non-negative decimal string (plain or exponent notation, as
 * produced by `String(number)`) to an integer and a power-of-ten scale:
 * value = digits / 10^scale.
 */
function textToScaled(numeric: string): { digits: bigint; scale: number } {
  const e = numeric.search(/e/i);
  const mantissa = e === -1 ? numeric : numeric.slice(0, e);
  const exponent = e === -1 ? 0 : Number(numeric.slice(e + 1));
  const dot = mantissa.indexOf('.');
  const intPart = dot === -1 ? mantissa : mantissa.slice(0, dot);
  const fracPart = dot === -1 ? '' : mantissa.slice(dot + 1);
  let digits = BigInt(intPart + fracPart);
  let scale = fracPart.length - exponent;
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits, scale };
}
