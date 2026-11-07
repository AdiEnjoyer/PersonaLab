import type { z } from 'zod';
import type { CustomExerciseSchema, GymBackupDataSchema, LibraryExerciseSchema, LibraryStateSchema, PhotoRefSchema, RoutineItemSchema, RoutineSchema, SessionEntrySchema, SessionSchema, SetRecordSchema } from './schema';
import type { CATEGORIES, EQUIPMENT, LEVELS, MUSCLES } from './constants';

export type Muscle = (typeof MUSCLES)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type Category = (typeof CATEGORIES)[number];
export type Level = (typeof LEVELS)[number];

export type PhotoRef = z.infer<typeof PhotoRefSchema>;
export type LibraryExercise = z.infer<typeof LibraryExerciseSchema>;
export type LibraryState = z.infer<typeof LibraryStateSchema>;
export type CustomExercise = z.infer<typeof CustomExerciseSchema>;
export type RoutineItem = z.infer<typeof RoutineItemSchema>;
export type Routine = z.infer<typeof RoutineSchema>;
export type SetRecord = z.infer<typeof SetRecordSchema>;
export type SessionEntry = z.infer<typeof SessionEntrySchema>;
export type Session = z.infer<typeof SessionSchema>;
export type GymBackupData = z.infer<typeof GymBackupDataSchema>;

/** View model of a library or custom exercise (not stored). */
export interface Exercise {
  id: string;
  source: 'library' | 'custom';
  name: string;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment;
  instructions: string[];
  /** Library photos carry a URL in `src`; custom photos carry the `imageId` of a stored image. */
  photos: Array<{ src?: string; imageId?: string; blurhash?: string; width: number; height: number }>;
  archived: boolean;
}
