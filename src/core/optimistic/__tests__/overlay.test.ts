import { describe, expect, it } from 'vitest';
import { applyOverlay, dedupeByKey } from '../overlay';

interface Item {
  id: string;
  v: number;
}

const add = (item: Item) => ({ apply: (list: readonly Item[]) => [...list, item] });
const edit = (id: string, v: number) => ({ apply: (list: readonly Item[]) => list.map((x) => (x.id === id ? { ...x, v } : x)) });
const remove = (id: string) => ({ apply: (list: readonly Item[]) => list.filter((x) => x.id !== id) });

describe('applyOverlay', () => {
  it('applies the ops in order without changing the stored list', () => {
    const stored: Item[] = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ];
    const out = applyOverlay(stored, [add({ id: 'c', v: 3 }), edit('c', 4), remove('a'), edit('b', 5)]);
    expect(out).toEqual([
      { id: 'b', v: 5 },
      { id: 'c', v: 4 },
    ]);
    expect(stored).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ]);
  });

  it('returns a copy of the stored list when there are no ops', () => {
    const stored: Item[] = [{ id: 'a', v: 1 }];
    const out = applyOverlay(stored, []);
    expect(out).toEqual(stored);
    expect(out).not.toBe(stored);
  });
});

describe('dedupeByKey', () => {
  it('keeps the first position and the last value of each key', () => {
    const list: Item[] = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'a', v: 3 },
    ];
    expect(dedupeByKey(list, (x) => x.id)).toEqual([
      { id: 'a', v: 3 },
      { id: 'b', v: 2 },
    ]);
  });

  it('leaves a list without duplicates unchanged', () => {
    const list: Item[] = [
      { id: 'b', v: 2 },
      { id: 'a', v: 1 },
    ];
    expect(dedupeByKey(list, (x) => x.id)).toEqual(list);
  });
});
