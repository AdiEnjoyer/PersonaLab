import { useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { addDays, type LocalDate } from '../../../core/time/localDate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { TREND } from '../constants';
import { useTrend } from '../data/energy';
import { setBurnOffset, setIgnoreUntil } from '../data/state';
import { offsetFromCorrection, suggestionView } from '../logic/trend';
import { signed2, whole } from './format';

/** Burn correction from the weight trend: suggestion, shortfalls or nothing (R39). */
export function SuggestionCard({ today }: { today: LocalDate }) {
  const trend = useTrend(today);
  const [busy, setBusy] = useState(false);
  if (trend.failed) return <ErrorPanel message="The burn correction could not be computed." onRetry={trend.retry} />;
  if (trend.value === undefined) return <Skeleton rows={2} />;
  const { result, energy, ignoreUntil } = trend.value;
  if (energy.status !== 'ready') return null;
  const view = suggestionView(result, energy.energy.dailyBurn, ignoreUntil, today);

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.show({ message: done });
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (view === 'suggest' && result.kind === 'computed') {
    // The offset uses the unrounded C and TDEE at the moment of the tap (R39.9).
    const offset = offsetFromCorrection(result.C, energy.energy.tdee);
    return (
      <CardFrame aria-label="Burn correction" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Burn correction</h2>
        <p>
          Your weight trend suggests a daily burn of <strong>{whole(result.C)} kcal</strong> (now {whole(energy.energy.dailyBurn)} kcal).
        </p>
        <p className="text-sm text-muted tabular-nums">
          Average intake {whole(result.I)} kcal · weight change {signed2(result.dW)} kg over {result.D} days · {result.L} days of data
        </p>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => void run(() => setBurnOffset(offset), 'Burn offset updated.')}>
            Accept
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => setIgnoreUntil(addDays(today, TREND.IGNORE_DAYS)), 'Suggestion hidden for 7 days.')}>
            Ignore
          </Button>
        </div>
      </CardFrame>
    );
  }
  if (view === 'out-of-range') {
    return (
      <CardFrame aria-label="Burn correction">
        <h2 className="text-base font-semibold">Burn correction</h2>
        <p className="text-sm text-muted">
          The computed burn is outside {TREND.C_MIN}–{TREND.C_MAX} kcal. The logged food or weight data may be incomplete, so no change is suggested.
        </p>
      </CardFrame>
    );
  }
  if (view === 'shortfalls' && result.kind === 'insufficient') {
    return (
      <CardFrame aria-label="Burn correction" className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Burn correction</h2>
        <p className="text-sm text-muted">More data is needed before your burn can be checked against your weight trend:</p>
        <ul className="list-disc pl-5 text-sm">
          {result.shortfalls.map((s) => (
            <li key={s.kind + ('block' in s ? s.block : '')}>
              {s.kind === 'history' ? `${s.missing} more ${s.missing === 1 ? 'day' : 'days'} of weight history` : null}
              {s.kind === 'weights' ? `${s.missing} more ${s.missing === 1 ? 'weigh-in' : 'weigh-ins'} in the ${s.block === 'first' ? 'first' : 'last'} week of the window` : null}
              {s.kind === 'logged' ? `${s.missing} more logged ${s.missing === 1 ? 'day' : 'days'} of food` : null}
            </li>
          ))}
        </ul>
      </CardFrame>
    );
  }
  return null;
}