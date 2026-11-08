export type BarcodeFormat = 'EAN_13' | 'EAN_8' | 'UPC_A' | 'UPC_E';

/** GS1 mod-10 check digit of `body` (the code without its check digit): weights 3, 1, 3, 1, ... from the rightmost digit. */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** All digits and the last one is the GS1 check digit of the rest. */
export const isValidGs1 = (code: string): boolean => /^\d{2,}$/.test(code) && gs1CheckDigit(code.slice(0, -1)) === Number(code.at(-1));

/** Expands an 8-digit UPC-E code (first digit 0 or 1) to its 12-digit UPC-A; the check digit is kept (R33.7). */
export function expandUpcE(upce: string): string {
  const ns = upce[0] ?? '';
  const x = upce.slice(1, 7);
  const check = upce[7] ?? '';
  const last = x[5] ?? '';
  switch (last) {
    case '0':
    case '1':
    case '2':
      return `${ns}${x.slice(0, 2)}${last}0000${x.slice(2, 5)}${check}`;
    case '3':
      return `${ns}${x.slice(0, 3)}00000${x.slice(3, 5)}${check}`;
    case '4':
      return `${ns}${x.slice(0, 4)}00000${x[4] ?? ''}${check}`;
    default:
      return `${ns}${x.slice(0, 5)}0000${last}${check}`;
  }
}

export const isValidUpcE = (code: string): boolean => /^[01]\d{7}$/.test(code) && isValidGs1(expandUpcE(code));

/** EAN-13 unchanged, UPC-A with one leading "0", UPC-E expanded then prefixed with "0", EAN-8 unchanged (R33.9). */
export function normaliseBarcode(code: string, format: BarcodeFormat): string {
  switch (format) {
    case 'EAN_13':
    case 'EAN_8':
      return code;
    case 'UPC_A':
      return `0${code}`;
    case 'UPC_E':
      return `0${expandUpcE(code)}`;
  }
}

/** Whether a decoded `text` is a valid code of `format` (check digit included; R33.3). */
export function isValidFor(format: BarcodeFormat, text: string): boolean {
  switch (format) {
    case 'EAN_13':
      return /^\d{13}$/.test(text) && isValidGs1(text);
    case 'UPC_A':
      return /^\d{12}$/.test(text) && isValidGs1(text);
    case 'EAN_8':
      return /^\d{8}$/.test(text) && isValidGs1(text);
    case 'UPC_E':
      return isValidUpcE(text);
  }
}

export type TypedBarcodeResult =
  | { ok: true; format: BarcodeFormat; normalised: string }
  | { ok: false; reason: 'characters' | 'length' | 'check-digit' };

/** Validates a typed barcode: spaces and hyphens are removed, then 13, 12 or 8 digits with a valid check digit (R33.5, R33.8). */
export function validateTyped(text: string): TypedBarcodeResult {
  const stripped = text.replace(/[ -]/g, '');
  if (!/^\d*$/.test(stripped)) return { ok: false, reason: 'characters' };
  const format: BarcodeFormat | undefined = stripped.length === 13 ? 'EAN_13' : stripped.length === 12 ? 'UPC_A' : stripped.length === 8 ? 'EAN_8' : undefined;
  if (format === undefined) return { ok: false, reason: 'length' };
  if (isValidFor(format, stripped)) return { ok: true, format, normalised: normaliseBarcode(stripped, format) };
  if (format === 'EAN_8' && isValidUpcE(stripped)) return { ok: true, format: 'UPC_E', normalised: normaliseBarcode(stripped, 'UPC_E') };
  return { ok: false, reason: 'check-digit' };
}

/** Message for a failed typed-barcode check (R33.8). */
export const TYPED_BARCODE_MESSAGES = {
  characters: 'Use digits only (spaces and hyphens are allowed).',
  length: 'A barcode has 8, 12 or 13 digits.',
  'check-digit': 'The check digit does not match. Check the number.',
} as const;

/** Whether a barcode may be looked up: 8 to 14 decimal digits (R34.14). */
export const isLookupBarcode = (barcode: unknown): barcode is string => typeof barcode === 'string' && /^\d{8,14}$/.test(barcode);
