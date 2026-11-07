/** Nutrition tables, database version 1. Stored as `nutrition_${short}` (R2.6). */
export const nutritionTables = {
  foodEntries: '&id, &idemKey, date, createdAt',
  savedMeals: '&id, &idemKey',
  dayMarks: '&date',
  products: '&barcode',
  weights: '&id, &idemKey, &date',
  images: '&id',
  state: '&key',
} as const satisfies Record<string, string>;
