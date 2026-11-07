import { AppLink } from '../../../app/AppLink';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { useExercises } from '../data/exercises';
import { useRoutines } from '../data/routines';
import { useActiveSession } from '../data/sessions';
import { StartWorkoutButton } from './StartWorkout';

/** Gym tab root: start card, routines and library entry points. */
export default function GymHome() {
  const routines = useRoutines();
  const active = useActiveSession();
  const { exercises } = useExercises();
  const exerciseCount = exercises?.filter((x) => !x.archived).length;
  const link = 'tap flex flex-col justify-center';
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Gym</h1>
      <CardFrame>
        <h2 className="mb-2 text-lg font-semibold">{active ? 'Workout in progress' : 'Start workout'}</h2>
        {active ? (
          <AppLink to="/gym/session" className="tap flex items-center justify-center rounded-continuous bg-accent px-4 font-medium text-accent-fg">
            Resume workout
          </AppLink>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">Choose a routine or start an empty session.</p>
            <StartWorkoutButton />
          </>
        )}
      </CardFrame>
      <CardFrame>
        <AppLink to="/gym/history" className={link}>
          <span className="font-medium">History</span>
          <span className="text-sm text-muted">Finished workouts</span>
        </AppLink>
      </CardFrame>
      <CardFrame>
        <AppLink to="/gym/split" className={link}>
          <span className="font-medium">Split analysis</span>
          <span className="text-sm text-muted">Weekly sets per muscle</span>
        </AppLink>
      </CardFrame>
      <CardFrame>
        <AppLink to="/gym/routines" className={link}>
          <span className="font-medium">Routines</span>
          <span className="text-sm text-muted">{routines === undefined ? ' ' : routines.length === 1 ? '1 routine' : `${routines.length} routines`}</span>
        </AppLink>
      </CardFrame>
      <CardFrame>
        <AppLink to="/gym/library" className={link}>
          <span className="font-medium">Exercise library</span>
          <span className="text-sm text-muted">{exerciseCount === undefined ? ' ' : `${exerciseCount} exercises`}</span>
        </AppLink>
      </CardFrame>
    </section>
  );
}
