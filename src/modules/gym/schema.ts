import { z } from 'zod';
import { BackupImageSchema } from '../../core/backup/schema';
import { CATEGORIES, EQUIPMENT, LEVELS, MUSCLES } from './constants';

export const MuscleSchema = z.enum(MUSCLES);
export const EquipmentSchema = z.enum(EQUIPMENT);

export const PhotoRefSchema = z.strictObject({
  imageId: z.string().min(1),
  blurhash: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

export const LibraryExerciseSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  primaryMuscles: z.array(MuscleSchema).min(1),
  secondaryMuscles: z.array(MuscleSchema),
  equipment: EquipmentSchema,
  category: z.enum(CATEGORIES),
  level: z.enum(LEVELS),
  instructions: z.array(z.string()),
  images: z.array(
    z.strictObject({
      path: z.string().min(1),
      blurhash: z.string(),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
    }),
  ),
});

/** `public/exercises/exercises.json`. */
export const LibraryFileSchema = z.array(LibraryExerciseSchema);

export const LibraryStateSchema = z.strictObject({ id: z.string().min(1), archived: z.literal(true) });

export const CustomExerciseSchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  name: z.string().min(1).max(80),
  primaryMuscles: z.array(MuscleSchema).min(1),
  secondaryMuscles: z.array(MuscleSchema),
  equipment: EquipmentSchema,
  photo: PhotoRefSchema.optional(),
  archived: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const RoutineItemSchema = z.strictObject({
  itemId: z.string().min(1),
  exerciseId: z.string().min(1),
  targetSets: z.number().int().min(1).max(10),
  repMin: z.number().int().min(1).max(100),
  repMax: z.number().int().min(1).max(100),
  restSec: z.number().int().min(15).max(600).optional(),
});

export const RoutineSchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  name: z.string().min(1).max(60),
  items: z.array(RoutineItemSchema).max(50),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const SetRecordSchema = z.strictObject({
  id: z.string().min(1),
  idemKey: z.string().min(1),
  weight: z.number().optional(),
  reps: z.number().optional(),
  weightSource: z.enum(['prefill', 'owner']),
  repsSource: z.enum(['prefill', 'owner']),
  completed: z.boolean(),
  completedAt: z.number().optional(),
});

export const SessionEntrySchema = z.strictObject({
  entryId: z.string().min(1),
  exerciseId: z.string().min(1),
  routineItemId: z.string().optional(),
  repMin: z.number().optional(),
  repMax: z.number().optional(),
  restSec: z.number().optional(),
  sets: z.array(SetRecordSchema),
});

export const SessionSchema = z.strictObject({
  id: z.string().min(1),
  status: z.enum(['active', 'finished']),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  lastChangeAt: z.number(),
  routineId: z.string().optional(),
  routineName: z.string().optional(),
  entries: z.array(SessionEntrySchema),
  restTimer: z.strictObject({ endAt: z.number(), alertDismissed: z.boolean().optional() }).optional(),
});

/** Gym backup data, data version 1 (design: Gym types). */
export const GymBackupDataSchema = z.strictObject({
  customExercises: z.array(CustomExerciseSchema),
  libraryState: z.array(LibraryStateSchema),
  routines: z.array(RoutineSchema),
  sessions: z.array(SessionSchema),
  images: z.array(BackupImageSchema),
});
