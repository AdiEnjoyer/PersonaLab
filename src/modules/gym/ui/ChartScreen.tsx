import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { round } from '../../../core/math/round';
import { toLocalDate } from '../../../core/time/localDate';
import { LineChartCard } from '../../../ui/chart/LineChartCard';
import { RangeSelector } from '../../../ui/chart/RangeSelector';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { useExercises } from '../data/exercises';
import { useFinishedSessions } from '../data/sessions';
import { chartPoints, CHART_METRICS, CHART_RANGES, DEFAULT_METRIC, DEFAULT_RANGE, inRange, MIN_CHART_SESSIONS, type ChartMetric, type ChartRange } from '../logic/charts';
import { displayName } from '../logic/format';
import { prMarksForExercise } from '../logic/pr';
/** Progress chart of one exercise (R25.3 to R25.7). */
export default function ChartScreen() {
  const { exerciseId = '' } = useParams();
  const finished = useFinishedSessions();
  const { exercises } = useExercises();
  const [metric, setMetric] = useState<ChartMetric>(DEFAULT_METRIC);
  const [range, setRange] = useState<ChartRange>(DEFAULT_RANGE);
  const all = useMemo(
    () => (finished === undefined ? undefined : chartPoints(exerciseId, finished, metric, prMarksForExercise(finished, exerciseId), toLocalDate)),
    [finished, exerciseId, metric],
  );
  if (finished === undefined || exercises === undefined || all === undefined) return <Skeleton rows={4} />;
  const exercise = exercises.find((x) => x.id === exerciseId);
  const visible = inRange(all, toLocalDate(Date.now()), range);
  const selectors = (
    <div className="flex flex-col gap-2">
      <RangeSelector<ChartMetric> label="Metric" options={CHART_METRICS} value={metric} onChange={setMetric} />
      <RangeSelector<ChartRange> label="Range" options={CHART_RANGES} value={range} onChange={setRange} />
    </div>
  );
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">{exercise === undefined ? 'Exercise progress' : displayName(exercise.name, exercise.archived)}</h1>
      {all.length < MIN_CHART_SESSIONS ? (
        <EmptyState title="Log this exercise in 2 sessions to see a chart" />
      ) : (
        <>
          {selectors}
          {visible.length === 0 ? (
            <EmptyState title="No sessions fall in the selected range" />
          ) : (
            <LineChartCard
              title={CHART_METRICS.find((m) => m.value === metric)!.label}
              data={visible.map((p) => ({ x: p.date, y: round(p.value, 1), marked: p.marked }))}
              yUnit=" kg"
            />
          )}
          {visible.some((p) => p.marked) ? (
            <CardFrame>
              <p className="text-sm text-muted">Personal record on: {visible.filter((p) => p.marked).map((p) => p.date).join(', ')}</p>
            </CardFrame>
          ) : null}
        </>
      )}
      <AppLink to={`/gym/library/${encodeURIComponent(exerciseId)}`} className="tap flex items-center text-accent underline">
        Back to exercise
      </AppLink>
    </section>
  );
}
