import { useMemo } from 'react';
import { useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { formatDurationMinutes } from '../../../core/time/format';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { useExercises } from '../data/exercises';
import { useFinishedSessions, useSession } from '../data/sessions';
import { displayName, formatVolume, formatVolumeChange, formatWeightReps } from '../logic/format';
import { PR_LABELS } from '../logic/pr';
import { finishSummary } from '../logic/summary';
/** Summary shown after finishing: duration, sets, volume, top sets, PRs and volume change (R22.5, R22.8). */
export default function SessionSummary() {
  const { sessionId = '' } = useParams();
  const session = useSession(sessionId);
  const finished = useFinishedSessions();
  const { exercises } = useExercises();
  const summary = useMemo(() => (session && session.status === 'finished' && finished ? finishSummary(session, finished) : undefined), [session, finished]);
  if (session === undefined || finished === undefined || exercises === undefined) return <Skeleton rows={5} />;
  if (session === null || session.status !== 'finished' || summary === undefined) {
    return (
      <EmptyState title="Summary not available">
        <AppLink to="/gym/history" className="text-accent underline">
          Open history
        </AppLink>
      </EmptyState>
    );
  }
  const names = new Map(exercises.map((x) => [x.id, displayName(x.name, x.archived)]));
  const name = (id: string) => names.get(id) ?? 'Unknown exercise';
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Workout finished</h1>
      <CardFrame>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Duration</dt>
          <dd>{formatDurationMinutes(summary.durationMs)}</dd>
          <dt className="text-muted">Completed sets</dt>
          <dd>{summary.completedSets}</dd>
          <dt className="text-muted">Total volume</dt>
          <dd>{formatVolume(summary.totalVolume)} kg</dd>
        </dl>
      </CardFrame>
      <CardFrame>
        <h2 className="mb-2 text-lg font-semibold">Exercises</h2>
        <ul className="flex flex-col gap-2">
          {summary.exercises.map((x) => (
            <li key={x.exerciseId}>
              <p className="font-medium">{name(x.exerciseId)}</p>
              <p className="text-sm text-muted">
                Top set {formatWeightReps(x.topSet.weight, x.topSet.reps)} · Volume {formatVolume(x.volume)} kg · {formatVolumeChange(x.change)}
              </p>
            </li>
          ))}
        </ul>
      </CardFrame>
      {summary.prs.length > 0 ? (
        <CardFrame>
          <h2 className="mb-2 text-lg font-semibold">Personal records</h2>
          <ul className="flex flex-col gap-1">
            {summary.prs.map((p) => (
              <li key={p.set.id}>
                {name(p.exerciseId)} {formatWeightReps(p.set.weight, p.set.reps)}: {p.types.map((t) => PR_LABELS[t]).join(', ')}
              </li>
            ))}
          </ul>
        </CardFrame>
      ) : null}
      <AppLink to="/gym" className="tap flex items-center text-accent underline">
        Back to Gym
      </AppLink>
    </section>
  );
}
