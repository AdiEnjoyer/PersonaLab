import { CALORIE_FLOOR } from '../constants';
import type { Sex } from '../../../core/profile/schema';
import type { EnergyResult } from '../types';
import { oneDecimal, whole } from './format';

/** BMR, TDEE and Daily_Burn with the Activity_Factor, hours and source label (R29.6) and the floor warning (R30.8). */
export function EnergyBreakdown({ energy, sex }: { energy: EnergyResult; sex: Sex }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums" aria-label="Energy breakdown">
      <dt className="text-muted">BMR</dt>
      <dd className="text-right">{whole(energy.bmr)} kcal</dd>
      <dt className="text-muted">Training</dt>
      <dd className="text-right">
        {oneDecimal(energy.hours)} h/week ({energy.hoursSource})
      </dd>
      <dt className="text-muted">Activity factor</dt>
      <dd className="text-right">{energy.factor}</dd>
      <dt className="text-muted">TDEE</dt>
      <dd className="text-right">{whole(energy.tdee)} kcal</dd>
      {energy.burnOffset !== 0 ? (
        <>
          <dt className="text-muted">Burn offset</dt>
          <dd className="text-right">{energy.burnOffset > 0 ? '+' : ''}{energy.burnOffset} kcal</dd>
        </>
      ) : null}
      <dt className="font-medium">Daily burn</dt>
      <dd className="text-right font-medium">{whole(energy.dailyBurn)} kcal</dd>
      <dt className="text-muted">Calorie target</dt>
      <dd className="text-right">{energy.calorieTarget} kcal</dd>
      <dt className="text-muted">Protein target</dt>
      <dd className="text-right">{energy.proteinTarget} g</dd>
      {energy.floored ? (
        <dd className="col-span-2 font-medium text-danger" role="status">
          The calorie target was raised to the minimum of {CALORIE_FLOOR[sex]} kcal.
        </dd>
      ) : null}
    </dl>
  );
}