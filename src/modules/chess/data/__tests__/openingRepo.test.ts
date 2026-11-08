import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { installWriteFailures, withFreshDb } from '../../../../test/helpers/db';
import { counterIds, fixtureTrees } from '../../logic/__tests__/repertoireFixtures';
import { CHESS_TABLES } from '../backup';
import { clearSeededFlag, countFirstReviews, readRepertoire, recordReview, resetToStarter, restoreSnapshot, saveTrees, seedStarterOnce, snapshot } from '../openingRepo';

const starter = { trees: [{ name: 'One', colour: 'w' as const, lines: [['e4 # idea', 'e5', 'Nf3']] }] };

const failures = installWriteFailures(db);
beforeEach(async () => {
  failures.clear();
  clearSeededFlag();
  await withFreshDb(async () => undefined);
});

describe('openingRepo', () => {
  it('seeds the starter once and not again after the trees are deleted', async () => {
    expect(await seedStarterOnce(async () => starter)).toBe(true);
    expect((await readRepertoire()).trees.map((t) => t.name)).toEqual(['One']);
    await saveTrees([]);
    expect(await seedStarterOnce(async () => starter)).toBe(false);
    expect((await readRepertoire()).trees).toEqual([]);
  });

  it('saves edited trees and deletes trees that are gone', async () => {
    const trees = fixtureTrees();
    await saveTrees(trees);
    await saveTrees(trees.slice(0, 1));
    expect((await readRepertoire()).trees.map((t) => t.id)).toEqual([trees[0]!.id]);
  });

  it('writes a review and its SRS state together, once per review id', async () => {
    const first = await recordReview({ reviewId: 'r1', posKey: 'w|k', q: 5, date: '2025-05-10' });
    expect(first).toMatchObject({ created: true, srs: { posKey: 'w|k', E: 260, n: 1, I: 1, due: '2025-05-11' } });
    const again = await recordReview({ reviewId: 'r1', posKey: 'w|k', q: 5, date: '2025-05-10' });
    expect(again.created).toBe(false);
    const data = await readRepertoire();
    expect(data.reviews).toHaveLength(1);
    expect(data.srs.get('w|k')).toMatchObject({ E: 260, n: 1 });
    expect(await countFirstReviews('2025-05-10')).toBe(1);
    await recordReview({ reviewId: 'r2', posKey: 'w|k', q: 3, date: '2025-05-11' });
    expect(await countFirstReviews('2025-05-11')).toBe(0);
  });

  it('keeps the SRS state when the review write fails', async () => {
    await recordReview({ reviewId: 'r1', posKey: 'w|k', q: 5, date: '2025-05-10' });
    failures.failNext(CHESS_TABLES.reviews, () => new Error('disk full'));
    await expect(recordReview({ reviewId: 'r2', posKey: 'w|k', q: 5, date: '2025-05-11' })).rejects.toThrow();
    failures.clear();
    const data = await readRepertoire();
    expect(data.srs.get('w|k')).toMatchObject({ E: 260, n: 1 });
    expect(data.reviews).toHaveLength(1);
  });

  it('rejects an invalid quality without storing anything', async () => {
    await expect(recordReview({ reviewId: 'r1', posKey: 'w|k', q: 9, date: '2025-05-10' })).rejects.toThrow();
    expect((await readRepertoire()).reviews).toEqual([]);
  });

  it('resets to the starter and restores the earlier state for Undo', async () => {
    await saveTrees(fixtureTrees(counterIds('t')));
    await recordReview({ reviewId: 'r1', posKey: 'w|k', q: 5, date: '2025-05-10' });
    const before = await snapshot();
    await resetToStarter(starter, 5);
    const after = await readRepertoire();
    expect(after.trees.map((t) => t.name)).toEqual(['One']);
    expect(after.srs.size).toBe(0);
    expect(after.reviews).toEqual([]);
    await restoreSnapshot(before);
    expect(await snapshot()).toEqual(before);
  });
});

