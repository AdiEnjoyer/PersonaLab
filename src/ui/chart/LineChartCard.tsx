import type { ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from '../motion/useReducedMotion';
import { CardFrame } from '../primitives/CardFrame';

export interface ChartPoint {
  x: number | string;
  /** `null` leaves a gap in the line. */
  y: number | null;
}

export interface LineChartCardProps {
  title: string;
  data: readonly ChartPoint[];
  height?: number;
  /** Controls such as a `RangeSelector`. */
  actions?: ReactNode;
  yUnit?: string;
  xFormatter?: (x: number | string) => string;
}

export function LineChartCard({ title, data, height = 180, actions, yUnit, xFormatter }: LineChartCardProps) {
  const reduced = useReducedMotion();
  return (
    <CardFrame aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data as ChartPoint[]} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--pl-border)" strokeDasharray="3 3" />
            <XAxis dataKey="x" stroke="var(--pl-muted)" fontSize={12} {...(xFormatter ? { tickFormatter: xFormatter } : {})} />
            <YAxis stroke="var(--pl-muted)" fontSize={12} width={40} domain={['auto', 'auto']} {...(yUnit ? { unit: yUnit } : {})} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="y"
              stroke="var(--pl-accent)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={!reduced}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </CardFrame>
  );
}
