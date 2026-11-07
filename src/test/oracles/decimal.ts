/**
 * Exact decimal arithmetic for test oracles, with BigInt only. A `Dec` is the exact value `n / 10^scale`.
 * Independent of production code.
 */
export interface Dec {
  n: bigint;
  scale: number;
}

/** Parses `[-]digits[.digits][e[+-]digits]` exactly; `null` for anything else. */
function parseExact(text: string, allowExponent: boolean, allowSign: boolean, allowComma: boolean): Dec | null {
  const match = /^(-?)(\d+)(?:([.,])(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (match === null) return null;
  const [, sign = '', intPart = '', separator, frac = '', exponent] = match;
  if (sign !== '' && !allowSign) return null;
  if (separator === ',' && !allowComma) return null;
  if (exponent !== undefined && !allowExponent) return null;
  let n = BigInt(intPart + frac);
  let scale = frac.length - (exponent === undefined ? 0 : Number(exponent));
  if (scale < 0) {
    n *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { n: sign === '-' ? -n : n, scale };
}

/**
 * The exact value of entered text: trimmed, non-negative digits with an optional `.` or `,` fraction.
 * No sign, no exponent. `null` when the text is not such a number.
 */
export function decFromEnteredText(text: string): Dec | null {
  return parseExact(text.trim(), false, false, true);
}

/** The exact value of a finite number's shortest decimal form (`String(v)`); `null` for NaN or ±Infinity. */
export function decFromNumber(v: number): Dec | null {
  if (!Number.isFinite(v)) return null;
  return parseExact(String(v), true, true, false);
}

/** A decimal literal such as "0.5" or "-1000". */
export function dec(literal: string): Dec {
  const d = parseExact(literal, false, true, false);
  if (d === null) throw new Error(`Not a decimal literal: ${literal}`);
  return d;
}

function align(a: Dec, b: Dec): [bigint, bigint] {
  const scale = Math.max(a.scale, b.scale);
  return [a.n * 10n ** BigInt(scale - a.scale), b.n * 10n ** BigInt(scale - b.scale)];
}

export function decCompare(a: Dec, b: Dec): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** True when `a` is an integer multiple of `step` (> 0). */
export function decIsMultiple(a: Dec, step: Dec): boolean {
  const [x, s] = align(a, step);
  return x % s === 0n;
}

/** True when `min ≤ a ≤ max` and `a` is a multiple of `step`, all exactly. */
export function decOnGrid(a: Dec, min: string, max: string, step: string): boolean {
  return decCompare(a, dec(min)) >= 0 && decCompare(a, dec(max)) <= 0 && decIsMultiple(a, dec(step));
}
