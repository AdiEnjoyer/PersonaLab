import { describe, expect, it } from 'vitest';
import { fold } from '../fold';
import { compareFolded } from '../compare';

describe('fold', () => {
  it('removes accents and lower-cases', () => {
    expect(fold('Éé')).toBe('ee');
    expect(fold('e\u0301')).toBe('e');
    expect(fold('Crème Brûlée')).toBe('creme brulee');
    expect(fold('BENCH Press')).toBe('bench press');
  });

  it('removes Hebrew niqqud and keeps the letters', () => {
    expect(fold('שָׁלוֹם')).toBe('שלום');
  });

  it('leaves text without marks unchanged apart from case', () => {
    expect(fold('squat (low bar) - 5/3/1')).toBe('squat (low bar) - 5/3/1');
    expect(fold('')).toBe('');
  });
});

describe('compareFolded', () => {
  it('orders by folded text in code-unit order', () => {
    expect(compareFolded('apple', 'Banana')).toBe(-1);
    expect(compareFolded('Éclair', 'eclair')).toBe(0);
    expect(compareFolded('zebra', 'Échelle')).toBe(1);
  });

  it('sorts names case- and accent-insensitively', () => {
    const names = ['row', 'Écarté', 'curl', 'Bench', 'éa'];
    expect([...names].sort(compareFolded)).toEqual(['Bench', 'curl', 'éa', 'Écarté', 'row']);
  });
});
