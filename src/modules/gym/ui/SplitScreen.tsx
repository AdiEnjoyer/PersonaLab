import { useMemo, useState } from 'react';
import { toLocalDate } from '../../../core/time/localDate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { Skeleton } from '../../../ui/status/Skeleton';
import { MUSCLES } from '../constants';
import { useExercises } from '../data/exercises';
import { useFinishedSessions } from '../data/sessions';
import { analyseSplit, formatSets, shiftWindow, windowDates } from '../logic/split';
const CLASS_LABEL = { low: 'Low', 'in range': 'In range', high: 'High' } as const;
const CLASS_STYLE = { low: 'text-danger', 'in range': 'text-fg', high: 'text-accent' } as const;
/** Weekly sets per muscle, flags and previous/next week controls (R26, R27). */
export default function SplitScreen() {
  const sessions = useFinishedSessions();
  const { exercises } = useExercises();
  const today = toLocalDate(Date.now());
  const [windowEnd, setWindowEnd] = useState(today);
  const result = useMemo(() => {
    if (sessions === undefined || exercises === undefined) return undefined;
    const map = new Map(exercises.map((x) => [x.id, { primaryMuscles: x.primaryMuscles, secondaryMuscles: x.secondaryMuscles }]));
    return analyseSplit({ sessions, exercises: map, windowEnd, toLocalDate });
  }, [sessions, exercises, windowEnd]);
  if (result === undefined) return <Skeleton rows={5} />;
  const dates = windowDates(windowEnd);
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Split analysis</h1>
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => setWindowEnd((d) => shiftWindow(d, -1))}>
          Previous week
        </Button>
        <span className="text-center text-sm text-muted">
          {dates[0]} to {dates[dates.length - 1]}
        </span>
        <Button variant="secondary" disabled={windowEnd >= today} onClick={() => setWindowEnd((d) => (shiftWindow(d, 1) > today ? today : shiftWindow(d, 1)))}>
          Next week
        </Button>
      </div>
      <p className="text-sm text-muted">
        {result.sessionCount} {result.sessionCount === 1 ? 'workout' : 'workouts'} finished in this week
      </p>
      {result.emptyMessage !== undefined ? <p role="status">{result.emptyMessage}</p> : null}
      {result.flags.length > 0 ? (
        <CardFrame>
          <h2 className="mb-2 text-lg font-semibold">Flags</h2>
          <ul className="list-disc space-y-1 pl-5">
            {result.flags.map((f) => (
              <li key={`${f.type}-${'muscle' in f ? f.muscle : ''}`}>{f.message}</li>
            ))}
          </ul>
        </CardFrame>
      ) : null}
      <CardFrame>
        <h2 className="mb-2 text-lg font-semibold">Weekly sets</h2>
        <ul className="flex flex-col gap-1">
          {MUSCLES.map((m) => (
            <li key={m} className="flex justify-between gap-2">
              <span>{m}</span>
              <span className={`tabular-nums ${CLASS_STYLE[result.classes[m]]}`}>
                {formatSets(result.weeklySets[m])} · {CLASS_LABEL[result.classes[m]]}
              </span>
            </li>
          ))}
        </ul>
      </CardFrame>
    </section>
  );
}
