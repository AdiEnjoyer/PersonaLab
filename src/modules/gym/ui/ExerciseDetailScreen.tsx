import { useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { restoreExercise, useExercises } from '../data/exercises';
import { displayName } from '../logic/format';
import { ArchiveControl } from './ArchiveControl';
import { ExercisePhoto } from './ExercisePhoto';

/** Exercise detail: photos, muscles, equipment, instructions and the history link (R14.7). */
export default function ExerciseDetailScreen() {
  const { exerciseId = '' } = useParams();
  const navigate = useAppNavigate();
  const { exercises } = useExercises();
  if (exercises === undefined) return <Skeleton rows={5} />;
  const exercise = exercises.find((x) => x.id === exerciseId);
  if (exercise === undefined) {
    return (
      <EmptyState title="Exercise not found">
        <AppLink to="/gym/library" className="text-accent underline">
          Back to exercises
        </AppLink>
      </EmptyState>
    );
  }
  const restore = async () => {
    try {
      await restoreExercise(exercise);
    } catch (error) {
      toast.show({ message: `Could not restore the exercise: ${toDbWriteError(error).reason}.`, kind: 'error' });
    }
  };
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{displayName(exercise.name, exercise.archived)}</h1>
      <div className="flex flex-col gap-3">
        {exercise.photos.length === 0 ? (
          <ExercisePhoto photo={undefined} alt="No photo available" />
        ) : (
          exercise.photos.map((photo, i) => <ExercisePhoto key={photo.src ?? photo.imageId ?? i} photo={photo} alt={`${exercise.name} photo ${i + 1}`} />)
        )}
      </div>
      <CardFrame>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Primary muscles</dt>
          <dd>{exercise.primaryMuscles.join(', ')}</dd>
          <dt className="text-muted">Secondary muscles</dt>
          <dd>{exercise.secondaryMuscles.length === 0 ? 'None' : exercise.secondaryMuscles.join(', ')}</dd>
          <dt className="text-muted">Equipment</dt>
          <dd>{exercise.equipment}</dd>
        </dl>
      </CardFrame>
      {exercise.instructions.length > 0 ? (
        <CardFrame>
          <h2 className="mb-2 text-lg font-semibold">Instructions</h2>
          <ol className="list-decimal space-y-2 pl-5">
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </CardFrame>
      ) : null}
      <AppLink to={`/gym/library/${encodeURIComponent(exercise.id)}/chart`} className="tap flex items-center text-accent underline">
        History and progress
      </AppLink>
      <div className="flex flex-wrap gap-2">
        {exercise.archived ? (
          <Button onClick={() => void restore()}>Restore</Button>
        ) : (
          <>
            {exercise.source === 'custom' ? (
              <AppLink to={`/gym/exercises/${encodeURIComponent(exercise.id)}/edit`} className="tap flex items-center rounded-continuous bg-surface-2 px-4 font-medium">
                Edit
              </AppLink>
            ) : null}
            <ArchiveControl exercise={exercise} onArchived={() => navigate('/gym/library', { replace: true })} />
          </>
        )}
      </div>
    </article>
  );
}
