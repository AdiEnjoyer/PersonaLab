export const MIFFLIN = { W: 10, H: 6.25, A: 5, MALE: 5, FEMALE: -161 };
export const ACTIVITY = [
  { below: 1, f: 1.2 },
  { below: 3, f: 1.375 },
  { below: 5, f: 1.55 },
  { below: 8, f: 1.725 },
  { below: Infinity, f: 1.9 },
] as const;
export const LOGGED_HOURS = { MIN_DAYS: 7, MAX_DAYS: 28, SESSION_CAP_H: 4, RECENT_DAYS: 28 };
export const GOAL_ADJUST_DEFAULT = { cut: -500, maintain: 0, bulk: 300 };
export const PROTEIN_DEFAULT = { cut: 2.2, maintain: 1.8, bulk: 1.6 };
export const CALORIE_FLOOR = { male: 1500, female: 1200 };
export const FOOD_LIMITS = { NAME: 80, KCAL: 5000, MACRO: 500, GRAMS_MIN: 0.1, GRAMS_MAX: 5000, ITEMS: 50 };
export const MULTIPLIER = { MIN: 0.25, MAX: 10, STEP: 0.25 };
export const PORTION = { GRAMS_MIN: 1, GRAMS_MAX: 5000, SERV_MIN: 0.25, SERV_MAX: 20, SERV_STEP: 0.25 };
export const OFF = {
  URL: 'https://world.openfoodfacts.org/api/v2/product/',
  FIELDS: ['product_name', 'brands', 'energy-kcal_100g', 'energy-kj_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'serving_quantity'],
  KJ_PER_KCAL: 4.184,
  MAX_KCAL: 1000,
  MAX_KJ: 4184,
  MAX_MACRO: 100,
  STALE_MS: 30 * 86_400_000,
  TIMEOUT_MS: 10_000,
};
/** Default Gemini model id, used until the Owner sets nutrition.geminiModel (model ids are retired often). */
export const GEMINI_DEFAULT_MODEL_ID = 'gemini-3.8-flash';
export const GEMINI_URL = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
export const GEMINI_PROMPT = `You are a nutrition estimator. Identify each distinct food in the photo. For each, estimate the edible portion in grams and its energy (kcal), protein, carbohydrate and fat in grams for that portion. Use typical recipes when unsure. Return only JSON matching the schema. Set confidence to low when the photo is unclear or portions are hard to judge.`;
export const GEMINI_TIMEOUT_MS = 45_000;
export const FREE_TIER_WARNING = 'Google may use data sent through the Gemini free tier, including your meal photos, to improve its products.';
export const AI_LIMITS = { ITEMS: 20, GRAMS: 3000, KCAL: 5000, MACRO: 500, REVIEW_GRAMS_MIN: 1, REVIEW_GRAMS_MAX: 5000 };
export const CONSISTENCY = { REL: 0.2, ABS_KCAL: 50 };
export const KCAL_PER_KG = 7700;
export const TREND = { MAX_L: 28, MIN_L: 14, BLOCK: 7, MIN_BLOCK_DATES: 3, LOGGED_SHARE: 0.8, MIN_DIFF: 100, C_MIN: 1200, C_MAX: 5000, IGNORE_DAYS: 7 };
/** Weight_Entry limits (R38.1). */
export const WEIGHT_LIMITS = { MIN: 30, MAX: 300 };
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export const SLOT_LABELS: Record<(typeof MEAL_SLOTS)[number], string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
/** Weight chart ranges in days (R38.5); `0` is all time. */
export const WEIGHT_RANGES = [
  { value: 30, label: '30 d' },
  { value: 90, label: '90 d' },
  { value: 180, label: '180 d' },
  { value: 365, label: '1 y' },
  { value: 0, label: 'All' },
] as const;
