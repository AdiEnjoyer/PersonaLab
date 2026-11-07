import type { z } from 'zod';
import type { LocalDate } from '../../core/time/localDate';
import type { MEAL_SLOTS } from './constants';
import type {
  DayMarkSchema,
  FoodEntrySchema,
  NutritionBackupDataSchema,
  NutritionStateRecordSchema,
  PhotoRefSchema,
  ProductSchema,
  SavedMealItemSchema,
  SavedMealSchema,
  WeightEntrySchema,
} from './schema';

export type { LocalDate };
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type PhotoRef = z.infer<typeof PhotoRefSchema>;
export type FoodEntry = z.infer<typeof FoodEntrySchema>;
export type SavedMealItem = z.infer<typeof SavedMealItemSchema>;
export type SavedMeal = z.infer<typeof SavedMealSchema>;
export type DayMark = z.infer<typeof DayMarkSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type WeightEntry = z.infer<typeof WeightEntrySchema>;
export type NutritionStateRecord = z.infer<typeof NutritionStateRecordSchema>;
export type NutritionBackupData = z.infer<typeof NutritionBackupDataSchema>;

export interface EnergyResult {
  bmr: number;
  factor: 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
  hours: number;
  hoursSource: 'override' | 'logged' | 'profile';
  tdee: number;
  burnOffset: number;
  dailyBurn: number;
  calorieTarget: number;
  floored: boolean;
  proteinTarget: number;
  currentWeight: number;
}
