import { AppLink } from '../../../app/AppLink';
import { formatDurationMinutes } from '../../../core/time/format';
import { toLocalDate } from '../../../core/time/localDate';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { useFinishedSessions } from '../data/sessions';
import { EMPTY_SESSION_NAME } from '../logic/dashboard';
import { formatVolume } from '../logic/format';
import { isCompletedSet, sessionDurationMs, sessionVolume } from '../logic/metrics';
/** Finished Sessions, newest first (R25.1, R25.8). */
export default function HistoryScreen() {
  const sessions = useFinishedSessions();
  if (sessions === undefined) return <Skeleton rows={4} />;
  if (sessions.length === 0) return <EmptyState title="No workouts finished yet">Finished workouts appear here.</EmptyState>;
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">History</h1>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <CardFrame>
              <AppLink to={`/gym/history/${encodeURIComponent(s.id)}`} className="tap flex flex-col justify-center">
                <span className="font-medium">
                  {toLocalDate(s.startedAt)} · {s.routineName ?? EMPTY_SESSION_NAME}
                </span>
                <span className="text-sm text-muted">
                  {formatDurationMinutes(sessionDurationMs({ startedAt: s.startedAt, finishedAt: s.finishedAt ?? s.startedAt }))} ·{' '}
                  {s.entries.reduce((n, e) => n + e.sets.filter(isCompletedSet).length, 0)} sets · {formatVolume(sessionVolume(s))} kg
                </span>
              </AppLink>
            </CardFrame>
          </li>
        ))}
      </ul>
    </section>
  );
}
