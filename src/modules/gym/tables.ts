/** Gym tables, database version 1. Stored as `gym_${short}` (R2.6). */
export const gymTables = {
  customExercises: '&id, &idemKey',
  libraryState: '&id',
  images: '&id',
  routines: '&id, &idemKey, createdAt',
  sessions: '&id, status, startedAt, finishedAt',
} as const satisfies Record<string, string>;
