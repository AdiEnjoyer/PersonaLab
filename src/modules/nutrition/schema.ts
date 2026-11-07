import { z } from 'zod';
import { BackupImageSchema } from '../../core/backup/schema';
import { isLocalDate } from '../../core/time/localDate';
import { FOOD_LIMITS, MEAL_SLOTS, WEIGHT_LIMITS } from './constants';

const LocalDateSchema = z.string().refine(isLocalDate, { message: 'Must be a Local_Date (YYYY-MM-DD)' });
const nonNegative = z.number().finite().min(0);

export const MealSlotSchema = z.enum(MEAL_SLOTS);
export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const PhotoRefSchema = z.strictObject({
  imageId: z.string().min(1),
  blurhash: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

/** A stored Food_Entry; values are unrounded. Portion and AI entries may legitimately exceed the manual-entry limits. */
export const FoodEntrySchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  date: LocalDateSchema,
  slot: MealSlotSchema,
  name: z.string().min(1),
  kcal: nonNegative,
  protein: nonNegative.optional(),
  carbs: nonNegative.optional(),
  fat: nonNegative.optional(),
  grams: nonNegative.optional(),
  source: z.enum(['manual', 'saved meal', 'barcode', 'ai']),
  barcode: z.string().min(1).optional(),
  confidence: ConfidenceSchema.optional(),
  thumbnail: PhotoRefSchema.optional(),
  createdAt: z.number(),
});

export const SavedMealItemSchema = z.strictObject({
  name: z.string().min(1).max(FOOD_LIMITS.NAME),
  kcal: nonNegative.max(FOOD_LIMITS.KCAL),
  protein: nonNegative.max(FOOD_LIMITS.MACRO),
  carbs: nonNegative.max(FOOD_LIMITS.MACRO),
  fat: nonNegative.max(FOOD_LIMITS.MACRO),
  grams: nonNegative.max(FOOD_LIMITS.GRAMS_MAX).optional(),
});

export const SavedMealSchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  name: z.string().min(1).max(FOOD_LIMITS.NAME),
  items: z.array(SavedMealItemSchema).min(1).max(FOOD_LIMITS.ITEMS),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const DayMarkSchema = z.strictObject({ date: LocalDateSchema, incomplete: z.literal(true) });

export const ProductSchema = z.strictObject({
  barcode: z.string().min(1),
  source: z.enum(['Open Food Facts', 'manual']),
  name: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  kcalPer100: nonNegative.optional(),
  proteinPer100: nonNegative.optional(),
  carbsPer100: nonNegative.optional(),
  fatPer100: nonNegative.optional(),
  servingQuantity: z.number().finite().gt(0).optional(),
  fetchedAt: z.number(),
});

export const WeightEntrySchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  date: LocalDateSchema,
  weightKg: z.number().finite().min(WEIGHT_LIMITS.MIN).max(WEIGHT_LIMITS.MAX),
  createdAt: z.number(),
});

export const NutritionStateRecordSchema = z.discriminatedUnion('key', [
  z.strictObject({ key: z.literal('burnOffset'), value: z.number().int() }),
  z.strictObject({ key: z.literal('trendIgnoreUntil'), value: LocalDateSchema }),
  z.strictObject({ key: z.literal('aiWarningAck'), value: z.number() }),
]);

/** Nutrition backup data, data version 1 (design: Nutrition types). */
export const NutritionBackupDataSchema = z.strictObject({
  foodEntries: z.array(FoodEntrySchema),
  savedMeals: z.array(SavedMealSchema),
  dayMarks: z.array(DayMarkSchema),
  products: z.array(ProductSchema),
  weights: z.array(WeightEntrySchema),
  state: z.array(NutritionStateRecordSchema),
  images: z.array(BackupImageSchema),
});
