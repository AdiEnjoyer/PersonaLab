import { describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { exportGymData, importGymData } from '../backup';
import { GymBackupDataSchema } from '../../schema';
import type { GymBackupData } from '../../types';

const sample: GymBackupData = {
  customExercises: [
    {
      id: 'c1',
      idemKey: 'k1',
      name: 'Cable thing',
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
      equipment: 'cable',
      photo: { imageId: 'img1', blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', width: 2, height: 2 },
      archived: false,
      createdAt: 1,
      updatedAt: 2,
    },
    { id: 'c2', idemKey: 'k2', name: 'Old', primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], equipment: 'machine', archived: true, createdAt: 1, updatedAt: 1 },
  ],
  libraryState: [{ id: 'Bench_Press', archived: true }],
  routines: [
    {
      id: 'r1',
      idemKey: 'rk',
      name: 'Push',
      items: [
        { itemId: 'i1', exerciseId: 'c1', targetSets: 3, repMin: 8, repMax: 12 },
        { itemId: 'i2', exerciseId: 'Bench_Press', targetSets: 3, repMin: 8, repMax: 12 },
        { itemId: 'i3', exerciseId: 'c2', targetSets: 3, repMin: 8, repMax: 12, restSec: 60 },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  sessions: [],
  images: [{ id: 'img1', mime: 'image/jpeg', base64: 'AAECAw==', width: 2, height: 2 }],
};

describe('gym backup data', () => {
  it('validates, imports and exports back; routine items of archived exercises are dropped', async () => {
    expect(GymBackupDataSchema.safeParse(sample).success).toBe(true);
    await withFreshDb(async () => {
      await db.transaction('rw', db.tables, async () => importGymData(sample));
      const bytes = await db.table('gym_images').get('img1');
      expect(new Uint8Array(bytes.bytes)).toEqual(new Uint8Array([0, 1, 2, 3]));
      const exported = await exportGymData();
      expect(exported.images).toEqual(sample.images);
      expect(exported.customExercises).toEqual(sample.customExercises);
      expect(exported.routines[0]!.items.map((i) => i.itemId)).toEqual(['i1']);
      // A second import of the export is stable.
      await db.transaction('rw', db.tables, async () => {
        for (const t of db.tables) if (t.name.startsWith('gym_')) await t.clear();
        await importGymData(exported);
      });
      expect(await exportGymData()).toEqual(exported);
    });
  });
});
