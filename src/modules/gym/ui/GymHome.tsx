import { AppLink } from '../../../app/AppLink';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { useExercises } from '../data/exercises';
import { useRoutines } from '../data/routines';

/** Gym tab root: start card, routines and library entry points. */
export default function GymHome() {
  const routines = useRoutines();
  const { exercises } = useExercises();
  const exerciseCount = exercises?.filter((x) => !x.archived).length;
  const link = 'tap flex flex-col justify-center';
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Gym</h1>
      <CardFrame>
        <h2 className="mb-2 text-lg font-semibold">Start workout</h2>
        <p className="mb-3 text-sm text-muted">Workout logging is not available yet.</p>
        <Button disabled>Start workout</Button>
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
