import { AppLink } from '../../../app/AppLink';
import { db } from '../../../core/db/db';
import { toLocalDate } from '../../../core/time/localDate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { TRACKED_MUSCLES } from '../constants';
import { useExercises } from '../data/exercises';
import { GYM_TABLES } from '../data/backup';
import { useActiveSession, useLiveRead } from '../data/sessions';
import { elapsedLabel, gymCardStats } from '../logic/dashboard';
import type { Session } from '../types';
import { StartWorkoutButton } from './StartWorkout';
import { useNow } from './useNow';
const readFinished = () => db.table<Session>(GYM_TABLES.sessions).where('status').equals('finished').toArray();
/** Gym card of the Home_Dashboard (R28). */
export default function GymDashboardCard() {
  const finished = useLiveRead(readFinished);
  const { exercises } = useExercises();
  const active = useActiveSession();
  const navigate = useAppNavigate();
  const now = useNow(1000, active !== null && active !== undefined);
  if (finished.failed) return <ErrorPanel message="The gym summary could not be loaded." onRetry={finished.retry} />;
  if (finished.value === undefined || exercises === undefined) return <Skeleton rows={3} />;
  const map = new Map(exercises.map((x) => [x.id, { primaryMuscles: x.primaryMuscles, secondaryMuscles: x.secondaryMuscles }]));
  const stats = gymCardStats(finished.value, map, toLocalDate(Date.now()), toLocalDate);
  return (
    <CardFrame aria-label="Gym" className="flex flex-col gap-3">
      <AppLink to="/gym" className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Gym</h2>
        <p>Sessions this week: {stats.sessionsLast7}</p>
        <p className="text-muted">{stats.last === undefined ? 'No workouts yet' : `Last: ${stats.last.date} · ${stats.last.routineName}`}</p>
        <p className="text-muted">
          Low or untrained muscles: {stats.lowOrUntrained} of {TRACKED_MUSCLES.length}
        </p>
      </AppLink>
      {active ? (
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate('/gym/session')}>Resume workout</Button>
          <span className="tabular-nums text-muted" aria-label="Elapsed time">
            {elapsedLabel(active.startedAt, now)}
          </span>
        </div>
      ) : (
        <div>
          <StartWorkoutButton />
        </div>
      )}
    </CardFrame>
  );
}
