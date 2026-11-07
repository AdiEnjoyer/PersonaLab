import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../../../core/db/db';
import { createIdempotent } from '../../../core/db/idempotent';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { enqueueWrite } from '../../../core/db/writeQueue';
import { newId } from '../../../core/ids';
import type { ImageRecord } from '../../../core/backup/base64';
import { captureSnapshot } from '../../../core/undo/recordDiff';
import { recordDiffUndo } from '../../../core/undo/recordDiff';
import { undoService } from '../../../core/undo/undoService';
import type { ProcessedImage } from '../../../core/image/processImage';
import { sortExercises } from '../logic/library';
import { withoutExercise } from '../logic/exerciseForm';
import type { CustomExercise, Equipment, Exercise, LibraryExercise, LibraryState, Muscle, Routine } from '../types';
import { GYM_TABLES } from './backup';
import { imageUrl, useLibrary, type LibraryStatus } from './library';

/** Library, custom and archive flags merged into the `Exercise` view type. */
export function mergeExercises(library: readonly LibraryExercise[], custom: readonly CustomExercise[], archivedLibraryIds: ReadonlySet<string>): Exercise[] {
  const fromLibrary: Exercise[] = library.map((x) => ({
    id: x.id,
    source: 'library',
    name: x.name,
    primaryMuscles: x.primaryMuscles,
    secondaryMuscles: x.secondaryMuscles,
    equipment: x.equipment,
    instructions: x.instructions,
    photos: x.images.map((i) => ({ src: imageUrl(i.path), blurhash: i.blurhash, width: i.width, height: i.height })),
    archived: archivedLibraryIds.has(x.id),
  }));
  const fromCustom: Exercise[] = custom.map((x) => ({
    id: x.id,
    source: 'custom',
    name: x.name,
    primaryMuscles: x.primaryMuscles,
    secondaryMuscles: x.secondaryMuscles,
    equipment: x.equipment,
    instructions: [],
    photos: x.photo === undefined ? [] : [{ imageId: x.photo.imageId, blurhash: x.photo.blurhash, width: x.photo.width, height: x.photo.height }],
    archived: x.archived,
  }));
  return sortExercises([...fromCustom, ...fromLibrary]);
}

export interface ExercisesState {
  /** Undefined while the first read is pending. */
  exercises: Exercise[] | undefined;
  libraryStatus: LibraryStatus;
}

/** All exercises, archived ones included (callers filter). Updates live. */
export function useExercises(): ExercisesState {
  const { status, library } = useLibrary();
  const stored = useLiveQuery(async () => {
    const [custom, state] = await Promise.all([db.table<CustomExercise>(GYM_TABLES.customExercises).toArray(), db.table<LibraryState>(GYM_TABLES.libraryState).toArray()]);
    return { custom, archived: new Set(state.map((s) => s.id)) };
  }, []);
  const exercises = useMemo(
    () => (stored === undefined || status === 'loading' ? undefined : mergeExercises(library, stored.custom, stored.archived)),
    [stored, status, library],
  );
  return { exercises, libraryStatus: status };
}

export interface CustomExerciseValues {
  name: string;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment;
}

/** A photo prepared by `processImage`, with the id it is stored under. */
export interface PreparedPhoto {
  imageId: string;
  image: ProcessedImage;
}

const toImageRecord = ({ imageId, image }: PreparedPhoto): ImageRecord => ({ id: imageId, mime: image.mime, bytes: image.bytes, width: image.width, height: image.height });
const toPhotoRef = ({ imageId, image }: PreparedPhoto) => ({ imageId, blurhash: image.blurhash, width: image.width, height: image.height });

/**
 * Creates the Custom_Exercise (and its photo) at most once per Idempotency_Key. Either both records are
 * stored or neither (R15.6, R15.9). `idemKey` and the photo's `imageId` stay the same across retries.
 */
export async function createCustomExercise(values: CustomExerciseValues, idemKey: string, photo?: PreparedPhoto, now = Date.now()): Promise<CustomExercise> {
  const record: CustomExercise = {
    id: newId(),
    idemKey,
    ...values,
    ...(photo === undefined ? {} : { photo: toPhotoRef(photo) }),
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  return write([GYM_TABLES.images, GYM_TABLES.customExercises], async () => {
    const existing = await db.table<CustomExercise>(GYM_TABLES.customExercises).where('idemKey').equals(idemKey).first();
    if (existing !== undefined) return existing;
    if (photo !== undefined) await db.table<ImageRecord>(GYM_TABLES.images).put(toImageRecord(photo));
    const { record: stored } = await createIdempotent(GYM_TABLES.customExercises, record);
    return stored;
  });
}

/** `photo`: a new photo, `'remove'` to drop the current one, or undefined to keep it (R15.5). */
export function updateCustomExercise(id: string, values: CustomExerciseValues, photo?: PreparedPhoto | 'remove', now = Date.now()): Promise<void> {
  return enqueueWrite(id, () =>
    write([GYM_TABLES.images, GYM_TABLES.customExercises], async () => {
      const table = db.table<CustomExercise>(GYM_TABLES.customExercises);
      const current = await table.get(id);
      if (current === undefined) throw new Error('The exercise no longer exists.');
      const { photo: oldPhoto, ...rest } = current;
      const next: CustomExercise = stripUndefined({
        ...rest,
        ...values,
        ...(photo === undefined ? (oldPhoto === undefined ? {} : { photo: oldPhoto }) : photo === 'remove' ? {} : { photo: toPhotoRef(photo) }),
        updatedAt: now,
      });
      if (photo !== undefined && photo !== 'remove') await db.table<ImageRecord>(GYM_TABLES.images).put(toImageRecord(photo));
      await table.put(next);
      if (photo !== undefined && oldPhoto !== undefined && (photo === 'remove' || photo.imageId !== oldPhoto.imageId)) {
        await db.table(GYM_TABLES.images).delete(oldPhoto.imageId);
      }
    }),
  );
}

/**
 * Archives the exercise and removes every Routine_Item that references it in one transaction (R16.3), then
 * offers Undo (R16.6). Throws `DbWriteError` and shows no Undo_Toast when the write fails (R16.10).
 */
export async function archiveExercise(exercise: Pick<Exercise, 'id' | 'source'>, now = Date.now()): Promise<void> {
  const table = exercise.source === 'custom' ? GYM_TABLES.customExercises : GYM_TABLES.libraryState;
  const tables = [GYM_TABLES.routines, table];
  const { before, after } = await write(tables, async () => {
    const routines = await db.table<Routine>(GYM_TABLES.routines).toArray();
    const affected = routines.filter((r) => r.items.some((i) => i.exerciseId === exercise.id));
    const keys = { [GYM_TABLES.routines]: affected.map((r) => r.id), [table]: [exercise.id] };
    const snapshotBefore = await captureSnapshot(tables, keys);
    for (const r of affected) await db.table(GYM_TABLES.routines).put(stripUndefined({ ...withoutExercise(r, exercise.id), updatedAt: now }));
    if (exercise.source === 'custom') {
      const current = await db.table<CustomExercise>(table).get(exercise.id);
      if (current === undefined) throw new Error('The exercise no longer exists.');
      await db.table(table).put({ ...current, archived: true, updatedAt: now });
    } else {
      await db.table<LibraryState>(table).put({ id: exercise.id, archived: true });
    }
    return { before: snapshotBefore, after: await captureSnapshot(tables, keys) };
  });
  undoService.push(recordDiffUndo('Exercise archived', before, after));
}

/** Marks the exercise as not archived. Removed Routine_Items are not re-added (R16.9). */
export function restoreExercise(exercise: Pick<Exercise, 'id' | 'source'>, now = Date.now()): Promise<void> {
  if (exercise.source === 'library') return write([GYM_TABLES.libraryState], () => db.table(GYM_TABLES.libraryState).delete(exercise.id));
  return write([GYM_TABLES.customExercises], async () => {
    const current = await db.table<CustomExercise>(GYM_TABLES.customExercises).get(exercise.id);
    if (current !== undefined) await db.table(GYM_TABLES.customExercises).put({ ...current, archived: false, updatedAt: now });
  });
}

/** Archived exercises sorted by name (R16.8). */
export function useArchivedExercises(): { archived: Exercise[] | undefined } {
  const { exercises } = useExercises();
  return { archived: useMemo(() => (exercises === undefined ? undefined : exercises.filter((x) => x.archived)), [exercises]) };
}
