import { describe, expect, it } from 'vitest';
import { enqueueWrite, pendingWriteKeys } from '../writeQueue';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('enqueueWrite', () => {
  it('applies the writes of one key in call order, even when earlier ones are slower', async () => {
    const applied: number[] = [];
    const waits = [30, 5, 20, 0, 10];
    await Promise.all(
      waits.map((ms, i) =>
        enqueueWrite('food:1', async () => {
          await delay(ms);
          applied.push(i);
        }),
      ),
    );
    expect(applied).toEqual([0, 1, 2, 3, 4]);
    expect(pendingWriteKeys()).toBe(0);
  });

  it('starts a write only after the previous one has settled', async () => {
    let running = 0;
    let maxRunning = 0;
    const op = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await delay(2);
      running -= 1;
    };
    await Promise.all([enqueueWrite('k', op), enqueueWrite('k', op), enqueueWrite('k', op)]);
    expect(maxRunning).toBe(1);
  });

  it('continues after a failed write and reports the failure only to its caller', async () => {
    const applied: string[] = [];
    const first = enqueueWrite('k', async () => {
      applied.push('a');
    });
    const failing = enqueueWrite('k', async () => {
      throw new Error('write failed');
    });
    const third = enqueueWrite('k', async () => {
      applied.push('c');
    });
    await expect(first).resolves.toBeUndefined();
    await expect(failing).rejects.toThrow('write failed');
    await expect(third).resolves.toBeUndefined();
    expect(applied).toEqual(['a', 'c']);
  });

  it('runs writes of different keys independently', async () => {
    const applied: string[] = [];
    const slow = enqueueWrite('a', async () => {
      await delay(30);
      applied.push('a');
    });
    const fast = enqueueWrite('b', async () => {
      applied.push('b');
    });
    await Promise.all([slow, fast]);
    expect(applied).toEqual(['b', 'a']);
  });
});
