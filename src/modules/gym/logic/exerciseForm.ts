import { EQUIPMENT, LIMITS, MUSCLES } from '../constants';
import type { Equipment, Exercise, Muscle, Routine } from '../types';

export interface ExerciseDraft {
  name: string;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: string | undefined;
}

export type ExerciseField = 'name' | 'primaryMuscles' | 'secondaryMuscles' | 'equipment';

export type ExerciseValidation =
  | { ok: true; value: { name: string; primaryMuscles: Muscle[]; secondaryMuscles: Muscle[]; equipment: Equipment } }
  | { ok: false; errors: Partial<Record<ExerciseField, string>> };

const isMuscle = (m: string): m is Muscle => (MUSCLES as readonly string[]).includes(m);
const isEquipment = (e: string): e is Equipment => (EQUIPMENT as readonly string[]).includes(e);

/** R15.1, R15.7: every failing field gets a message that states its rule. */
export function validateCustomExercise(draft: ExerciseDraft): ExerciseValidation {
  const errors: Partial<Record<ExerciseField, string>> = {};
  const name = draft.name.trim();
  if (name.length < 1 || name.length > LIMITS.EXERCISE_NAME) errors.name = `The name must have 1 to ${LIMITS.EXERCISE_NAME} characters.`;
  if (draft.primaryMuscles.length < 1 || !draft.primaryMuscles.every(isMuscle)) errors.primaryMuscles = 'Choose at least one primary muscle.';
  if (!draft.secondaryMuscles.every(isMuscle)) errors.secondaryMuscles = 'Choose secondary muscles from the list.';
  else if (draft.secondaryMuscles.some((m) => draft.primaryMuscles.includes(m))) {
    errors.secondaryMuscles = 'A muscle cannot be both primary and secondary.';
  }
  if (draft.equipment === undefined || !isEquipment(draft.equipment)) errors.equipment = 'Choose one equipment type.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      primaryMuscles: draft.primaryMuscles as Muscle[],
      secondaryMuscles: draft.secondaryMuscles as Muscle[],
      equipment: draft.equipment as Equipment,
    },
  };
}

/**
 * The other non-archived exercise with the same trimmed name, ignoring letter case (R15.4).
 * `selfId` is the exercise being edited, which never conflicts with itself.
 */
export function findDuplicateName<T extends Pick<Exercise, 'id' | 'name' | 'archived'>>(name: string, exercises: readonly T[], selfId?: string): T | undefined {
  const wanted = name.trim().toLowerCase();
  return exercises.find((x) => !x.archived && x.id !== selfId && x.name.trim().toLowerCase() === wanted);
}

export interface ArchiveImpactRow {
  routineId: string;
  routineName: string;
  itemCount: number;
}

/** Routines that use the exercise, with how many of their items would be removed (R16.2). Empty = no confirmation. */
export function archiveImpact(routines: readonly Routine[], exerciseId: string): ArchiveImpactRow[] {
  const rows: ArchiveImpactRow[] = [];
  for (const r of routines) {
    const itemCount = r.items.filter((i) => i.exerciseId === exerciseId).length;
    if (itemCount > 0) rows.push({ routineId: r.id, routineName: r.name, itemCount });
  }
  return rows;
}

/** The routine without any item of `exerciseId` (R16.3). Other items keep their relative order. */
export const withoutExercise = (r: Routine, exerciseId: string): Routine => ({ ...r, items: r.items.filter((i) => i.exerciseId !== exerciseId) });
