import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { round } from '../../../core/math/round';
import { addDays, daysBetween, type LocalDate } from '../../../core/time/localDate';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { useReducedMotion } from '../../../ui/motion/useReducedMotion';
import { trendSeries } from '../logic/weight';
import type { WeightEntry } from '../types';

/** One point per Weight_Entry plus the Weight_Trend line, with a gap where the trend is undefined (R38.5). */
export function WeightChart({ entries, from, to }: { entries: readonly WeightEntry[]; from: LocalDate; to: LocalDate }) {
  const reduced = useReducedMotion();
  const trend = new Map(trendSeries(entries, from, to).map((p) => [p.date, p.value]));
  const byDate = new Map(entries.map((e) => [e.date, e.weightKg]));
  const data = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => {
    const date = addDays(from, i);
    const t = trend.get(date);
    return { x: date, weight: byDate.get(date) ?? null, trend: t === undefined ? null : round(t, 1) };
  });
  return (
    <CardFrame aria-label="Weight chart">
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--pl-border)" strokeDasharray="3 3" />
            <XAxis dataKey="x" stroke="var(--pl-muted)" fontSize={12} minTickGap={32} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis stroke="var(--pl-muted)" fontSize={12} width={40} domain={['auto', 'auto']} unit=" kg" />
            <Tooltip />
            <Line type="linear" dataKey="weight" name="Weight" stroke="none" dot={{ r: 3, fill: 'var(--pl-muted)' }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="trend" name="Trend" stroke="var(--pl-accent)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={!reduced} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </CardFrame>
  );
}