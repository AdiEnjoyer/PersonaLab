import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { isLocalDate } from '../../../core/time/localDate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { deleteSavedMeal, useSavedMeals } from '../data/food';
import type { SavedMeal } from '../types';
import { AddMealSheet } from './AddMealSheet';
import { whole } from './format';
import { useToday } from './useToday';

/** Saved_Meal list with add-to-day and delete with Undo (R31.5, R31.11). */
export default function MealsScreen() {
  const meals = useSavedMeals();
  const today = useToday();
  const [params] = useSearchParams();
  const dateParam = params.get('date');
  const date = dateParam !== null && isLocalDate(dateParam) ? dateParam : today;
  const [adding, setAdding] = useState<SavedMeal>();

  const remove = async (meal: SavedMeal) => {
    try {
      await deleteSavedMeal(meal);
    } catch (e) {
      toast.show({ message: `Could not delete the meal: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };

  if (meals.failed) return <ErrorPanel message="The saved meals could not be loaded." onRetry={meals.retry} />;
  if (meals.value === undefined) return <Skeleton rows={3} />;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Saved meals</h1>
        <AppLink to={`/nutrition/meals/new?date=${date}`} className="tap flex items-center rounded-continuous bg-accent px-4 font-medium text-accent-fg">
          New meal
        </AppLink>
      </div>
      {meals.value.length === 0 ? (
        <EmptyState title="No saved meals yet">Save the foods you eat often and add them to a day in one tap.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {meals.value.map((m) => (
            <li key={m.id}>
              <CardFrame className="flex flex-col gap-2">
                <AppLink to={`/nutrition/meals/${encodeURIComponent(m.id)}?date=${date}`} className="tap flex flex-col justify-center">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-sm text-muted tabular-nums">
                    {m.items.length === 1 ? '1 item' : `${m.items.length} items`} · {whole(m.items.reduce((s, i) => s + i.kcal, 0))} kcal
                  </span>
                </AppLink>
                <div className="flex gap-2">
                  <Button onClick={() => setAdding(m)}>Add to {date === today ? 'today' : date}</Button>
                  <Button variant="ghost" aria-label={`Delete ${m.name}`} onClick={() => void remove(m)}>
                    Delete
                  </Button>
                </div>
              </CardFrame>
            </li>
          ))}
        </ul>
      )}
      <AddMealSheet meal={adding} date={date} onClose={() => setAdding(undefined)} />
    </section>
  );
}