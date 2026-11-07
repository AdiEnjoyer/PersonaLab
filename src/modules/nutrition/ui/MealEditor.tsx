import { useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toDbWriteError } from '../../../core/db/errors';
import { newIdemKey } from '../../../core/ids';
import { isLocalDate } from '../../../core/time/localDate';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { FieldError } from '../../../ui/form/FieldError';
import { Skeleton } from '../../../ui/status/Skeleton';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { createSavedMeal, updateSavedMeal, useEntriesForCopy, useSavedMeal } from '../data/food';
import { EMPTY_FOOD_FORM, validateSavedMealForm, type FoodFormText, type SavedMealFormError } from '../logic/food';
import type { FoodEntry, SavedMeal, SavedMealItem } from '../types';
import { FoodFieldsForm } from './FoodFieldsForm';
import { whole } from './format';
import { useToday } from './useToday';

/** One item being edited. `fixed` holds the exact stored or copied values until the Owner edits the item. */
interface DraftItem {
  key: number;
  text: FoodFormText;
  fixed?: SavedMealItem;
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n));
const toText = (i: SavedMealItem): FoodFormText => ({ name: i.name, kcal: str(i.kcal), protein: str(i.protein), carbs: str(i.carbs), fat: str(i.fat), grams: str(i.grams) });

function itemFromEntry(e: FoodEntry): SavedMealItem {
  return { name: e.name, kcal: e.kcal, protein: e.protein ?? 0, carbs: e.carbs ?? 0, fat: e.fat ?? 0, ...(e.grams !== undefined ? { grams: e.grams } : {}) };
}

function EditorBody({ meal, date }: { meal: SavedMeal | undefined; date: string }) {
  const navigate = useAppNavigate();
  const nextKey = useRef(0);
  const idemKey = useRef(newIdemKey());
  const draftOf = (item: SavedMealItem): DraftItem => ({ key: nextKey.current++, text: toText(item), fixed: item });
  const [name, setName] = useState(meal?.name ?? '');
  const [items, setItems] = useState<DraftItem[]>(() => (meal ? meal.items.map(draftOf) : [{ key: nextKey.current++, text: { ...EMPTY_FOOD_FORM } }]));
  const [errors, setErrors] = useState<SavedMealFormError>();
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const entries = useEntriesForCopy(date, copying);

  const save = async () => {
    const checked = validateSavedMealForm(name, items.map((i) => i.fixed ?? i.text));
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors(undefined);
    setBusy(true);
    try {
      if (meal) await updateSavedMeal(meal.id, checked.value);
      else await createSavedMeal(checked.value, idemKey.current);
      navigate(`/nutrition/meals?date=${date}`);
    } catch (e) {
      toast.show({ message: `The meal was not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const copySelected = () => {
    const chosen = (entries ?? []).filter((e) => picked.has(e.id)).map(itemFromEntry);
    setItems((prev) => [...prev, ...chosen.map(draftOf)]);
    setPicked(new Set());
    setCopying(false);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h1 className="text-xl font-semibold">{meal ? 'Edit meal' : 'New meal'}</h1>
      <TextField label="Meal name" value={name} onChange={setName} error={errors?.name} autoComplete="off" />
      {items.map((item, index) => (
        <CardFrame key={item.key} aria-label={`Item ${index + 1}`} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Item {index + 1}</h2>
            <Button variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={() => setItems((prev) => prev.filter((p) => p.key !== item.key))}>
              Remove
            </Button>
          </div>
          <FoodFieldsForm
            value={item.text}
            errors={errors?.itemErrors[index] ?? {}}
            onChange={(text) => setItems((prev) => prev.map((p) => (p.key === item.key ? { key: p.key, text } : p)))}
          />
        </CardFrame>
      ))}
      <FieldError message={errors?.items} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setItems((prev) => [...prev, { key: nextKey.current++, text: { ...EMPTY_FOOD_FORM } }])}>
          Add item
        </Button>
        <Button variant="secondary" onClick={() => setCopying(true)}>
          Copy from {date}
        </Button>
      </div>
      <Button type="submit" disabled={busy}>
        Save meal
      </Button>

      <Sheet open={copying} onRequestClose={() => setCopying(false)} title={`Entries on ${date}`}>
        <div className="flex flex-col gap-2 pb-4">
          {entries === undefined ? (
            <Skeleton rows={2} />
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted">No entries on this day.</p>
          ) : (
            entries.map((e) => (
              <label key={e.id} className="tap flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={picked.has(e.id)}
                  onChange={(ev) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (ev.target.checked) next.add(e.id);
                      else next.delete(e.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="text-sm text-muted tabular-nums">{whole(e.kcal)} kcal</span>
              </label>
            ))
          )}
          <Button disabled={picked.size === 0} onClick={copySelected}>
            Copy selected
          </Button>
        </div>
      </Sheet>
    </form>
  );
}

/** Create or edit a Saved_Meal; `/nutrition/meals/new` creates (R31.4). */
export default function MealEditor() {
  const { mealId = 'new' } = useParams();
  const [params] = useSearchParams();
  const today = useToday();
  const dateParam = params.get('date');
  const date = dateParam !== null && isLocalDate(dateParam) ? dateParam : today;
  const meal = useSavedMeal(mealId === 'new' ? undefined : mealId);
  if (mealId === 'new') return <EditorBody meal={undefined} date={date} />;
  if (meal.value === undefined) return <Skeleton rows={4} />;
  if (meal.value === null) return <EmptyState title="This meal no longer exists" />;
  return <EditorBody key={meal.value.id} meal={meal.value} date={date} />;
}