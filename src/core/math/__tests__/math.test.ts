import { describe, expect, it } from 'vitest';
import { round } from '../round';
import { isMultipleOfStep, parseDecimal } from '../decimal';
import { relClose } from '../tolerance';

describe('round', () => {
  it('rounds decimal inputs exactly, half away from zero', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(2.5)).toBe(3);
    expect(round(-2.5)).toBe(-3);
    expect(round(0.5)).toBe(1);
    expect(round(-0.5)).toBe(-1);
    expect(round(1.45, 1)).toBe(1.5);
    expect(round(116.66666666666667, 1)).toBe(116.7);
  });

  it('defaults to 0 decimals and keeps values that need no rounding', () => {
    expect(round(1.4)).toBe(1);
    expect(round(12.34, 2)).toBe(12.34);
    expect(round(7, 3)).toBe(7);
  });

  it('never returns -0', () => {
    expect(Object.is(round(-0.001, 2), 0)).toBe(true);
    expect(Object.is(round(-0), 0)).toBe(true);
  });

  it('handles numbers whose String form uses exponent notation', () => {
    expect(round(1e-7, 2)).toBe(0);
    expect(round(5e-7, 6)).toBe(0.000001);
    expect(round(1.5e21)).toBe(1.5e21);
    expect(round(123.456, -1)).toBe(120);
  });

  it('returns non-finite input unchanged and rejects fractional decimals', () => {
    expect(round(Number.NaN)).toBeNaN();
    expect(round(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(() => round(1, 1.5)).toThrow(RangeError);
  });
});

describe('parseDecimal', () => {
  it('parses digits with an optional fraction after trimming', () => {
    expect(parseDecimal(' 70.2 ', { maxDecimals: 1 })).toBe(70.2);
    expect(parseDecimal('80', { maxDecimals: 0 })).toBe(80);
    expect(parseDecimal('0.25', { maxDecimals: 2 })).toBe(0.25);
  });

  it('rejects too many fractional digits', () => {
    expect(parseDecimal('70.25', { maxDecimals: 1 })).toBeNull();
    expect(parseDecimal('175.5', { maxDecimals: 0 })).toBeNull();
  });

  it('accepts a comma only when allowed', () => {
    expect(parseDecimal('70,5', { maxDecimals: 1 })).toBeNull();
    expect(parseDecimal('70,5', { maxDecimals: 1, allowComma: true })).toBe(70.5);
  });

  it('rejects anything that is not a plain non-negative decimal', () => {
    for (const t of ['', ' ', '-1', '+1', '1.', '.5', '1e3', 'abc', '1.2.3', '1 000', 'NaN', 'Infinity']) {
      expect(parseDecimal(t, { maxDecimals: 3, allowComma: true })).toBeNull();
    }
  });
});

describe('isMultipleOfStep', () => {
  it('checks numbers with the 1e-9 tolerance', () => {
    expect(isMultipleOfStep(3.5, 0.5)).toBe(true);
    expect(isMultipleOfStep(3.2, 0.5)).toBe(false);
    expect(isMultipleOfStep(0.3, 0.1)).toBe(true);
    expect(isMultipleOfStep(70.2, 0.1)).toBe(true);
    expect(isMultipleOfStep(105, 15)).toBe(true);
    expect(isMultipleOfStep(100, 15)).toBe(false);
    expect(isMultipleOfStep(Number.NaN, 1)).toBe(false);
  });

  it('checks entered text exactly', () => {
    expect(isMultipleOfStep('3.5', 0.5)).toBe(true);
    expect(isMultipleOfStep('3.2', 0.5)).toBe(false);
    expect(isMultipleOfStep('70.2', 0.1)).toBe(true);
    expect(isMultipleOfStep('70.25', 0.1)).toBe(false);
    expect(isMultipleOfStep('70,3', 0.1)).toBe(true);
    expect(isMultipleOfStep('0', 0.5)).toBe(true);
    expect(isMultipleOfStep('12.000', 2.5)).toBe(false);
    expect(isMultipleOfStep('12.500', 2.5)).toBe(true);
    expect(isMultipleOfStep('0.0000003', 1e-7)).toBe(true);
    expect(isMultipleOfStep('abc', 0.5)).toBe(false);
  });

  it('rejects a step that is not positive and finite', () => {
    expect(() => isMultipleOfStep(1, 0)).toThrow(RangeError);
    expect(() => isMultipleOfStep(1, -0.5)).toThrow(RangeError);
    expect(() => isMultipleOfStep('1', Number.NaN)).toThrow(RangeError);
  });
});

describe('relClose', () => {
  it('compares relative to the larger magnitude', () => {
    expect(relClose(100, 100.5, 0.01)).toBe(true);
    expect(relClose(100, 102, 0.01)).toBe(false);
    expect(relClose(0, 0, 0)).toBe(true);
    expect(relClose(-5, -5.04, 0.01)).toBe(true);
  });
});
