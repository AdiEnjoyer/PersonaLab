import { useMemo, useState } from 'react';
import type { LocalDate } from '../../../core/time/localDate';
import { LineChartCard } from '../../../ui/chart/LineChartCard';
import { RangeSelector } from '../../../ui/chart/RangeSelector';
import { Select } from '../../../ui/form/Select';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { TIME_CLASSES } from '../constants';
import { RATING_RANGES, ratingHistory, type RatingRange } from '../logic/games';
import type { GameRecord } from '../types';

export const MIN_RATED_MESSAGE = 'Play at least 2 rated games in this time class to see a chart';
export const NO_RANGE_MESSAGE = 'No rated games fall in the selected range.';

/** Rating history per time class from the stored games (R45.8, R45.9). */
export function RatingHistory({ games, today }: { games: readonly GameRecord[]; today: LocalDate }) {
  const [timeClass, setTimeClass] = useState<string>('rapid');
  const [range, setRange] = useState<RatingRange>('3m');
  const { rated, points } = useMemo(() => ratingHistory(games, timeClass, range, today), [games, timeClass, range, today]);

  const selectors = (
    <div className="flex flex-wrap items-end gap-2">
      <Select label="Time class" value={timeClass} options={TIME_CLASSES.map((t) => ({ value: t, label: t }))} onChange={setTimeClass} />
      <RangeSelector<RatingRange> options={RATING_RANGES} value={range} onChange={setRange} />
    </div>
  );

  if (rated < 2 || points.length === 0) {
    return (
      <CardFrame aria-label="Rating history" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Rating history</h2>
        {selectors}
        <p className="text-muted">{rated < 2 ? MIN_RATED_MESSAGE : NO_RANGE_MESSAGE}</p>
      </CardFrame>
    );
  }
  return (
    <LineChartCard
      title="Rating history"
      actions={selectors}
      data={points.map((p) => ({ x: p.date, y: p.rating }))}
      xFormatter={(x) => String(x).slice(5)}
    />
  );
}
