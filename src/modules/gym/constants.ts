export const MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export const EQUIPMENT = [
  'body only',
  'machine',
  'other',
  'foam roll',
  'kettlebells',
  'dumbbell',
  'cable',
  'barbell',
  'bands',
  'medicine ball',
  'exercise ball',
  'e-z curl bar',
] as const;

export const CATEGORIES = [
  'strength',
  'stretching',
  'plyometrics',
  'strongman',
  'powerlifting',
  'cardio',
  'olympic weightlifting',
] as const;

export const LEVELS = ['beginner', 'intermediate', 'expert'] as const;

export const TRACKED_MUSCLES = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'lats',
  'middle back',
  'traps',
  'lower back',
  'abdominals',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
] as const;

export const SPLIT = { LOW_BELOW: 10, HIGH_ABOVE: 20, WINDOW_DAYS: 7, STEP_DAYS: 7, IMBALANCE_RATIO: 1.5 };

/** An E1RM must exceed the prior maximum by more than this to count as a PR (R24.3, R24.6). */
export const PR_E1RM_TOLERANCE_KG = 0.001;

export const LIMITS = {
  WEIGHT_MAX: 1000,
  REPS_MAX: 100,
  SETS_PER_EXERCISE: 20,
  ROUTINE_ITEMS: 50,
  ROUTINE_NAME: 60,
  EXERCISE_NAME: 80,
  SEARCH_TEXT: 100,
  TARGET_SETS_MAX: 10,
};

export const ROUTINE_ITEM_DEFAULTS = { targetSets: 3, repMin: 8, repMax: 12 };

export const REST = { MIN: 30, MAX: 600, STEP: 15, DEFAULT: 90, ADJUST: 15, ITEM_MIN: 15 };

export const RESUME_STALE_MS = 10_800_000; // 3 h (R21.2)
export const AUTOSAVE_MAX_DELAY_MS = 500; // R21.1

/** Runtime cache of exercise photos; the service worker route in `src/sw.ts` uses the same name (R13.6). */
export const EXERCISE_IMAGE_CACHE = 'exercise-images-v1';

/** Custom_Exercise photo pipeline (R15.3). */
export const CUSTOM_PHOTO = { maxSide: 1024, quality: 0.85 };

/** Photo build limits (R13.2). */
export const LIBRARY_IMAGE_MAX_SIDE = 600;
