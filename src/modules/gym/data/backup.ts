import Dexie from 'dexie';
import { imageFromBackup, imageToBackup, type ImageRecord } from '../../../core/backup/base64';
import { stripUndefined } from '../../../core/db/strip';
import { GymBackupDataSchema } from '../schema';
import type { CustomExercise, GymBackupData, LibraryState, Routine, Session } from '../types';

export const GYM_TABLES = {
  customExercises: 'gym_customExercises',
  libraryState: 'gym_libraryState',
  images: 'gym_images',
  routines: 'gym_routines',
  sessions: 'gym_sessions',
} as const;

/** Loaded on first use: core/db/db imports the module registry, which imports this module. */
const loadDb = async () => (await import('../../../core/db/db')).db;

const ALL_TABLES = Object.values(GYM_TABLES);

/** Everything the Gym module stores, images as base64 (R6.2). */
export async function exportGymData(): Promise<GymBackupData> {
  const db = await loadDb();
  return db.transaction('r', ALL_TABLES, async () => {
    const [customExercises, libraryState, routines, sessions, images] = await Promise.all([
      db.table<CustomExercise>(GYM_TABLES.customExercises).toArray(),
      db.table<LibraryState>(GYM_TABLES.libraryState).toArray(),
      db.table<Routine>(GYM_TABLES.routines).toArray(),
      db.table<Session>(GYM_TABLES.sessions).toArray(),
      db.table<ImageRecord>(GYM_TABLES.images).toArray(),
    ]);
    return { customExercises, libraryState, routines, sessions, images: images.map(imageToBackup) };
  });
}

/**
 * Writes `data` into the (already cleared) Gym tables. Keeps the R16.7 invariant: a Routine_Item that
 * references an archived exercise is dropped.
 */
export async function importGymData(data: GymBackupData): Promise<void> {
  // Inside the importer's transaction nothing foreign may be awaited first, so take the database from it.
  const db = Dexie.currentTransaction?.db ?? (await loadDb());
  const archived = new Set<string>([
    ...data.libraryState.map((s) => s.id),
    ...data.customExercises.filter((e) => e.archived).map((e) => e.id),
  ]);
  const routines = data.routines.map((r) => ({ ...r, items: r.items.filter((i) => !archived.has(i.exerciseId)) }));
  await db.table(GYM_TABLES.customExercises).bulkAdd(stripUndefined(data.customExercises));
  await db.table(GYM_TABLES.libraryState).bulkAdd(stripUndefined(data.libraryState));
  await db.table(GYM_TABLES.routines).bulkAdd(stripUndefined(routines));
  await db.table(GYM_TABLES.sessions).bulkAdd(stripUndefined(data.sessions));
  await db.table(GYM_TABLES.images).bulkAdd(data.images.map(imageFromBackup));
}

export const gymBackup = {
  dataVersion: 1,
  schema: GymBackupDataSchema,
  migrations: {} as Record<number, (data: unknown) => unknown>,
  sections: (data: GymBackupData) => [
    { name: 'customExercises', records: data.customExercises },
    { name: 'libraryState', records: data.libraryState },
    { name: 'routines', records: data.routines },
    { name: 'sessions', records: data.sessions },
    { name: 'images', records: data.images },
  ],
};
