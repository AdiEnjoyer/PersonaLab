import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toDbWriteError } from '../../../core/db/errors';
import { newIdemKey } from '../../../core/ids';
import { isLocalDate, toLocalDate, type LocalDate } from '../../../core/time/localDate';
import { Select } from '../../../ui/form/Select';
import { Button } from '../../../ui/primitives/Button';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { MEAL_SLOTS, SLOT_LABELS } from '../constants';
import { addManualEntry, updateFoodEntry, useFoodEntry } from '../data/food';
import { EMPTY_FOOD_FORM, validateFoodForm, type FieldErrors, type FoodFormText } from '../logic/food';
import type { FoodEntry, MealSlot } from '../types';
import { FoodFieldsForm } from './FoodFieldsForm';
import { useToday } from './useToday';

const SLOT_OPTIONS = MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }));
const isSlot = (s: string | null): s is MealSlot => s !== null && (MEAL_SLOTS as readonly string[]).includes(s);
const text = (n: number | undefined): string => (n === undefined ? '' : String(n));

function FormBody({ entry, date, defaultSlot }: { entry: FoodEntry | undefined; date: LocalDate; defaultSlot: MealSlot }) {
  const navigate = useAppNavigate();
  // One Idempotency_Key per opened form: repeated taps and retries create one entry (R31.2).
  const idemKey = useRef(newIdemKey());
  const [form, setForm] = useState<FoodFormText>(
    entry
      ? { name: entry.name, kcal: text(entry.kcal), protein: text(entry.protein), carbs: text(entry.carbs), fat: text(entry.fat), grams: text(entry.grams) }
      : EMPTY_FOOD_FORM,
  );
  const [slot, setSlot] = useState<MealSlot>(entry?.slot ?? defaultSlot);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const checked = validateFoodForm(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (entry) await updateFoodEntry(entry.id, checked.value, slot);
      else await addManualEntry(checked.value, { date, slot, idemKey: idemKey.current });
      navigate(date === toLocalDate(Date.now()) ? '/nutrition' : `/nutrition/day/${entry?.date ?? date}`);
    } catch (e) {
      // The draft stays in the form; the same key is reused on retry (R11.6).
      toast.show({ message: `The entry was not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h1 className="text-xl font-semibold">{entry ? 'Edit food' : 'Add food'}</h1>
      <p className="text-sm text-muted">{entry?.date ?? date}</p>
      <Select label="Meal" value={slot} options={SLOT_OPTIONS} onChange={(v) => isSlot(v) && setSlot(v)} />
      <FoodFieldsForm value={form} onChange={setForm} errors={errors} />
      <Button type="submit" disabled={busy}>
        Save
      </Button>
    </form>
  );
}

/** Manual add and edit form for a Food_Entry (R31.2, R31.3, R31.9). `?entry=` edits; `?date=` and `?slot=` preselect. */
export default function FoodForm() {
  const [params] = useSearchParams();
  const today = useToday();
  const entryId = params.get('entry') ?? undefined;
  const loaded = useFoodEntry(entryId);
  const dateParam = params.get('date');
  const date = dateParam !== null && isLocalDate(dateParam) ? dateParam : today;
  const slotParam = params.get('slot');
  const slot: MealSlot = isSlot(slotParam) ? slotParam : 'breakfast';
  if (entryId !== undefined) {
    if (loaded.value === undefined) return <Skeleton rows={4} />;
    if (loaded.value === null) return <EmptyState title="This entry no longer exists" />;
    return <FormBody entry={loaded.value} date={loaded.value.date} defaultSlot={loaded.value.slot} />;
  }
  return <FormBody entry={undefined} date={date} defaultSlot={slot} />;
}