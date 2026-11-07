import { describe, expect, it } from 'vitest';
import { stripUndefined } from '../strip';

describe('stripUndefined', () => {
  it('removes undefined properties at any depth and keeps every other value', () => {
    const input = {
      id: 'a',
      note: undefined,
      zero: 0,
      empty: '',
      nil: null,
      flag: false,
      nested: { keep: 1, drop: undefined, deeper: { drop: undefined } },
      list: [{ a: 1, b: undefined }, 2, undefined],
    };
    const out = stripUndefined(input);
    expect(out).toStrictEqual({
      id: 'a',
      zero: 0,
      empty: '',
      nil: null,
      flag: false,
      nested: { keep: 1, deeper: {} },
      list: [{ a: 1 }, 2, undefined],
    });
    expect(Object.hasOwn(out, 'note')).toBe(false);
    expect(Object.hasOwn(out.nested, 'drop')).toBe(false);
  });

  it('does not mutate the input', () => {
    const input = { a: 1, b: undefined, c: { d: undefined } };
    stripUndefined(input);
    expect(Object.hasOwn(input, 'b')).toBe(true);
    expect(Object.hasOwn(input.c, 'd')).toBe(true);
  });

  it('keeps binary data, dates and class instances as they are', () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const typed = new Uint8Array([4]);
    const when = new Date(0);
    const out = stripUndefined({ bytes, typed, when, gone: undefined });
    expect(out.bytes).toBe(bytes);
    expect(out.typed).toBe(typed);
    expect(out.when).toBe(when);
    expect(Object.keys(out)).toEqual(['bytes', 'typed', 'when']);
  });

  it('returns primitives unchanged', () => {
    expect(stripUndefined(5)).toBe(5);
    expect(stripUndefined('x')).toBe('x');
    expect(stripUndefined(null)).toBe(null);
    expect(stripUndefined(undefined)).toBe(undefined);
  });
});
