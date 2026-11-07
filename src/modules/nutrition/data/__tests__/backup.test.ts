import { describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { NutritionBackupDataSchema } from '../../schema';
import type { NutritionBackupData } from '../../types';
import { exportNutritionData, importNutritionData } from '../backup';

const sample: NutritionBackupData = {
  foodEntries: [
    { id: 'f1', idemKey: 'k1', date: '2025-06-15', slot: 'lunch', name: 'Pita 🥙', kcal: 273.5, protein: 9, source: 'manual', createdAt: 1 },
    {
      id: 'f2',
      idemKey: 'k2',
      date: '2025-06-15',
      slot: 'dinner',
      name: 'Plate',
      kcal: 600,
      source: 'ai',
      confidence: 'low',
      thumbnail: { imageId: 'img1', blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', width: 2, height: 2 },
      createdAt: 2,
    },
  ],
  savedMeals: [{ id: 'm1', idemKey: 'mk', name: 'Oats', items: [{ name: 'Oats', kcal: 150, protein: 5, carbs: 27, fat: 3, grams: 40 }], createdAt: 1, updatedAt: 2 }],
  dayMarks: [{ date: '2025-06-14', incomplete: true }],
  products: [{ barcode: '7290000000001', source: 'manual', name: 'Bar', kcalPer100: 400, fetchedAt: 5 }],
  weights: [{ id: 'w1', idemKey: 'wk', date: '2025-06-15', weightKg: 80.5, createdAt: 3 }],
  state: [
    { key: 'burnOffset', value: -120 },
    { key: 'trendIgnoreUntil', value: '2025-06-22' },
  ],
  images: [{ id: 'img1', mime: 'image/jpeg', base64: 'AAECAw==', width: 2, height: 2 }],
};

describe('nutrition backup data', () => {
  it('validates, imports and exports back unchanged', async () => {
    expect(NutritionBackupDataSchema.safeParse(sample).success).toBe(true);
    await withFreshDb(async () => {
      await db.transaction('rw', db.tables, async () => importNutritionData(sample));
      const stored = await db.table('nutrition_images').get('img1');
      expect(new Uint8Array(stored.bytes)).toEqual(new Uint8Array([0, 1, 2, 3]));
      const exported = await exportNutritionData();
      expect(exported.images).toEqual(sample.images);
      for (const key of ['foodEntries', 'savedMeals', 'dayMarks', 'products', 'weights', 'state'] as const) {
        expect(exported[key]).toEqual(expect.arrayContaining(sample[key] as never[]));
        expect(exported[key]).toHaveLength(sample[key].length);
      }
    });
  });

  it('rejects an invalid weight and a date that is not a Local_Date', () => {
    expect(NutritionBackupDataSchema.safeParse({ ...sample, weights: [{ ...sample.weights[0]!, weightKg: 12 }] }).success).toBe(false);
    expect(NutritionBackupDataSchema.safeParse({ ...sample, dayMarks: [{ date: '2025-13-40', incomplete: true }] }).success).toBe(false);
  });
});