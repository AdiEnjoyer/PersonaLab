import { useRef, useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { newIdemKey } from '../../../core/ids';
import type { LocalDate } from '../../../core/time/localDate';
import { Select } from '../../../ui/form/Select';
import { Button } from '../../../ui/primitives/Button';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { MEAL_SLOTS, MULTIPLIER, SLOT_LABELS } from '../constants';
import { addSavedMealToDay } from '../data/food';
import type { MealSlot, SavedMeal } from '../types';

const SLOT_OPTIONS = MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }));
const MULTIPLIERS = Array.from({ length: Math.round((MULTIPLIER.MAX - MULTIPLIER.MIN) / MULTIPLIER.STEP) + 1 }, (_, i) => {
  const k = MULTIPLIER.MIN + i * MULTIPLIER.STEP;
  return { value: String(k), label: `×${k}` };
});

function Body({ meal, date, onDone }: { meal: SavedMeal; date: LocalDate; onDone(): void }) {
  // One Idempotency_Key per opened sheet: repeated taps create each Food_Entry once (R31.5).
  const actionKey = useRef(newIdemKey());
  const [slot, setSlot] = useState<MealSlot>('breakfast');
  const [k, setK] = useState('1');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const r = await addSavedMealToDay(meal, Number(k), { date, slot, actionKey: actionKey.current });
      if (!r.ok) {
        setError(
          r.maxMultiplier === null
            ? `"${r.firstItem}" is over the limit even at ×${MULTIPLIER.MIN}. Nothing was added.`
            : `"${r.firstItem}" is over the limit at ×${k}. The largest multiplier is ×${r.maxMultiplier}. Nothing was added.`,
        );
        return;
      }
      setError(undefined);
      toast.show({ message: `Added ${meal.name} to ${SLOT_LABELS[slot]}.` });
      onDone();
    } catch (e) {
      toast.show({ message: `The meal was not added: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-sm text-muted">{date}</p>
      <Select label="Meal" value={slot} options={SLOT_OPTIONS} onChange={(v) => setSlot(v as MealSlot)} />
      <Select label="Multiplier" value={k} options={MULTIPLIERS} onChange={setK} />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button disabled={busy} onClick={() => void add()}>
        Add to day
      </Button>
    </div>
  );
}

/** Adds a Saved_Meal to a day with a slot and a multiplier of 0.25 to 10 (R31.5, R31.10). */
export function AddMealSheet({ meal, date, onClose }: { meal: SavedMeal | undefined; date: LocalDate; onClose(): void }) {
  return (
    <Sheet open={meal !== undefined} onRequestClose={onClose} title={meal ? `Add ${meal.name}` : 'Add meal'}>
      {meal ? <Body key={meal.id} meal={meal} date={date} onDone={onClose} /> : null}
    </Sheet>
  );
}