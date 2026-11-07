import { ringState } from '../logic/rings';
import type { Totals } from '../logic/food';
import { RingBlock } from './RingBlock';

/** Calorie and protein rings for a day's totals; the targets come from the live energy values (R32). */
export function RingsPanel({ totals, calorieTarget, proteinTarget, missing, size }: { totals: Totals; calorieTarget: number | undefined; proteinTarget: number | undefined; missing?: 'profile' | 'error'; size?: number }) {
  const common = { ...(missing ? { missing } : {}), ...(size ? { size } : {}) };
  return (
    <div className="flex flex-col gap-3">
      <RingBlock title="Calories" unit="kcal" state={ringState(totals.kcal, calorieTarget)} {...common} />
      <RingBlock title="Protein" unit="g" state={ringState(totals.protein, proteinTarget)} {...common} />
    </div>
  );
}