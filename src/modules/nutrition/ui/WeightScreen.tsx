import { useMemo, useRef, useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { newIdemKey } from '../../../core/ids';
import { addDays, type LocalDate } from '../../../core/time/localDate';
import { RangeSelector } from '../../../ui/chart/RangeSelector';
import { NumberField } from '../../../ui/form/NumberField';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { WEIGHT_RANGES } from '../constants';
import { deleteWeight, saveWeight, useWeights } from '../data/weights';
import { validateWeightForm, type WeightFormErrors } from '../logic/weight';
import type { WeightEntry } from '../types';
import { oneDecimal } from './format';
import { SuggestionCard } from './SuggestionCard';
import { useToday } from './useToday';
import { WeightChart } from './WeightChart';

function WeightForm({ today, editing, onDone }: { today: LocalDate; editing: WeightEntry | undefined; onDone(): void }) {
  // One Idempotency_Key per opened form (R11.1).
  const idemKey = useRef(newIdemKey());
  const [weight, setWeight] = useState(editing ? String(editing.weightKg) : '');
  const [date, setDate] = useState<LocalDate>(editing?.date ?? today);
  const [errors, setErrors] = useState<WeightFormErrors>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const checked = validateWeightForm(weight, date, today);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const { replaced } = await saveWeight({ ...(editing ? { id: editing.id } : {}), idemKey: idemKey.current, date, weightKg: checked.weightKg });
      if (!replaced) toast.show({ message: 'Weight saved.' });
      onDone();
    } catch (e) {
      toast.show({ message: `The weight was not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      aria-label={editing ? 'Edit weight' : 'Add weight'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <NumberField label="Weight" unit="kg" value={weight} onChange={setWeight} error={errors.weight} hint="30.0 to 300.0, one decimal" />
      <TextField label="Date" type="date" value={date} max={today} onChange={setDate} error={errors.date} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** `/nutrition/weight`: weigh-ins, trend chart and burn correction (R38, R39). */
export default function WeightScreen() {
  const today = useToday();
  const weights = useWeights();
  const [range, setRange] = useState<number>(90);
  const [form, setForm] = useState<{ editing?: WeightEntry } | null>(null);

  const earliest = weights.value?.[0]?.date;
  const from = range === 0 ? (earliest ?? today) : addDays(today, -(range - 1));
  const visible = useMemo(() => (weights.value ?? []).filter((w) => w.date >= from && w.date <= today), [weights.value, from, today]);

  const remove = async (w: WeightEntry) => {
    try {
      await deleteWeight(w);
    } catch (e) {
      toast.show({ message: `Could not delete the weight: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };

  if (weights.failed) return <ErrorPanel message="The weights could not be loaded." onRetry={weights.retry} />;
  if (weights.value === undefined) return <Skeleton rows={4} />;
  const newestFirst = [...weights.value].reverse();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Weight</h1>
        {form === null ? <Button onClick={() => setForm({})}>Add weight</Button> : null}
      </div>

      {form !== null ? (
        <CardFrame>
          <WeightForm key={form.editing?.id ?? 'new'} today={today} editing={form.editing} onDone={() => setForm(null)} />
        </CardFrame>
      ) : null}

      <RangeSelector<number> options={WEIGHT_RANGES} value={range} onChange={setRange} />
      {visible.length === 0 ? (
        <CardFrame>
          <EmptyState title="No weigh-ins in this range">
            <Button className="mt-2" onClick={() => setForm({})}>
              Add weight
            </Button>
          </EmptyState>
        </CardFrame>
      ) : (
        <WeightChart entries={weights.value} from={from} to={today} />
      )}

      <SuggestionCard today={today} />

      {newestFirst.length > 0 ? (
        <CardFrame aria-label="Weigh-ins">
          <ul className="flex flex-col">
            {newestFirst.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 border-b border-line last:border-0">
                <span className="tabular-nums">
                  {w.date} · {oneDecimal(w.weightKg)} kg
                </span>
                <span className="flex">
                  <Button variant="ghost" aria-label={`Edit weight of ${w.date}`} onClick={() => setForm({ editing: w })}>
                    Edit
                  </Button>
                  <Button variant="ghost" aria-label={`Delete weight of ${w.date}`} onClick={() => void remove(w)}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </CardFrame>
      ) : null}
    </section>
  );
}