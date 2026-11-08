// Feature: personal-lab, Property 83: GS1 check digits and UPC-E expansion
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expandUpcE, gs1CheckDigit, isValidGs1, isValidUpcE } from '../barcode';

const digits = (len: number) => fc.array(fc.integer({ min: 0, max: 9 }), { minLength: len, maxLength: len }).map((d) => d.join(''));

describe('Property 83', () => {
  it('appending the check digit makes a valid code; changing one digit makes it invalid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(7, 11, 12).chain((len) => fc.tuple(digits(len), fc.nat({ max: len }), fc.integer({ min: 1, max: 9 }))),
        ([body, posRaw, delta]) => {
          const code = body + gs1CheckDigit(body);
          expect(isValidGs1(code)).toBe(true);
          const pos = posRaw % code.length;
          const changed = code.slice(0, pos) + String((Number(code[pos]) + delta) % 10) + code.slice(pos + 1);
          expect(isValidGs1(changed)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  }, 60_000);

  it('a valid UPC-E expands to a valid UPC-A with the same check digit', () => {
    fc.assert(
      fc.property(fc.constantFrom('0', '1'), digits(6), (ns, x) => {
        const body = expandUpcE(ns + x + '0').slice(0, 11);
        const check = gs1CheckDigit(body);
        const upce = ns + x + check;
        expect(isValidUpcE(upce)).toBe(true);
        const upca = expandUpcE(upce);
        expect(upca).toHaveLength(12);
        expect(isValidGs1(upca)).toBe(true);
        expect(upca.at(-1)).toBe(String(check));
      }),
      { numRuns: 300 },
    );
  }, 60_000);
});
