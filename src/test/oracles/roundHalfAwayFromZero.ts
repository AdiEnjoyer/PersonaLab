/**
 * Oracle for Property 31: rounds the exact decimal `n / 10^p` to `d` decimals,
 * half away from zero, with BigInt arithmetic only. Returns the result as a
 * plain decimal string (never "-0"). Independent of production code.
 */
export function roundDecimalOracle(n: bigint, p: number, d: number): string {
  const negative = n < 0n;
  const abs = negative ? -n : n;

  let magnitude: bigint; // result × 10^d
  if (d >= p) {
    magnitude = abs * 10n ** BigInt(d - p);
  } else {
    const q = 10n ** BigInt(p - d);
    // floor(abs / q + 1/2) rounds the magnitude half up, i.e. half away from zero.
    magnitude = (2n * abs + q) / (2n * q);
  }

  if (magnitude === 0n) return '0';
  const digits = magnitude.toString().padStart(d + 1, '0');
  const intPart = digits.slice(0, digits.length - d);
  const fracPart = digits.slice(digits.length - d);
  return `${negative ? '-' : ''}${intPart}${d > 0 ? `.${fracPart}` : ''}`;
}
