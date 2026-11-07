import Dexie from 'dexie';
import { imageFromBackup, imageToBackup, type ImageRecord } from '../../../core/backup/base64';
import { stripUndefined } from '../../../core/db/strip';
import { NutritionBackupDataSchema } from '../schema';
import type { DayMark, FoodEntry, NutritionBackupData, NutritionStateRecord, Product, SavedMeal, WeightEntry } from '../types';

export const NUTRITION_TABLES = {
  foodEntries: 'nutrition_foodEntries',
  savedMeals: 'nutrition_savedMeals',
  dayMarks: 'nutrition_dayMarks',
  products: 'nutrition_products',
  weights: 'nutrition_weights',
  images: 'nutrition_images',
  state: 'nutrition_state',
} as const;

/** Loaded on first use: core/db/db imports the module registry, which imports this module. */
const loadDb = async () => (await import('../../../core/db/db')).db;

const ALL_TABLES = Object.values(NUTRITION_TABLES);

/** Everything the Nutrition module stores, images as base64 (R6.2). */
export async function exportNutritionData(): Promise<NutritionBackupData> {
  const db = await loadDb();
  return db.transaction('r', ALL_TABLES, async () => {
    const [foodEntries, savedMeals, dayMarks, products, weights, state, images] = await Promise.all([
      db.table<FoodEntry>(NUTRITION_TABLES.foodEntries).toArray(),
      db.table<SavedMeal>(NUTRITION_TABLES.savedMeals).toArray(),
      db.table<DayMark>(NUTRITION_TABLES.dayMarks).toArray(),
      db.table<Product>(NUTRITION_TABLES.products).toArray(),
      db.table<WeightEntry>(NUTRITION_TABLES.weights).toArray(),
      db.table<NutritionStateRecord>(NUTRITION_TABLES.state).toArray(),
      db.table<ImageRecord>(NUTRITION_TABLES.images).toArray(),
    ]);
    return { foodEntries, savedMeals, dayMarks, products, weights, state, images: images.map(imageToBackup) };
  });
}

/** Writes `data` into the (already cleared) Nutrition tables. */
export async function importNutritionData(data: NutritionBackupData): Promise<void> {
  // Inside the importer's transaction nothing foreign may be awaited first, so take the database from it.
  const db = Dexie.currentTransaction?.db ?? (await loadDb());
  await db.table(NUTRITION_TABLES.foodEntries).bulkAdd(stripUndefined(data.foodEntries));
  await db.table(NUTRITION_TABLES.savedMeals).bulkAdd(stripUndefined(data.savedMeals));
  await db.table(NUTRITION_TABLES.dayMarks).bulkAdd(stripUndefined(data.dayMarks));
  await db.table(NUTRITION_TABLES.products).bulkAdd(stripUndefined(data.products));
  await db.table(NUTRITION_TABLES.weights).bulkAdd(stripUndefined(data.weights));
  await db.table(NUTRITION_TABLES.state).bulkAdd(stripUndefined(data.state));
  await db.table(NUTRITION_TABLES.images).bulkAdd(data.images.map(imageFromBackup));
}

export const nutritionBackup = {
  dataVersion: 1,
  schema: NutritionBackupDataSchema,
  migrations: {} as Record<number, (data: unknown) => unknown>,
  sections: (data: NutritionBackupData) => [
    { name: 'foodEntries', records: data.foodEntries },
    { name: 'savedMeals', records: data.savedMeals },
    { name: 'dayMarks', records: data.dayMarks },
    { name: 'products', records: data.products },
    { name: 'weights', records: data.weights },
    { name: 'state', records: data.state },
    { name: 'images', records: data.images },
  ],
};
