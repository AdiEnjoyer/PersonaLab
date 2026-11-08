import { Navigate, useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { addDays, isLocalDate, type LocalDate } from '../../../core/time/localDate';
import { Switch } from '../../../ui/form/Switch';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { MEAL_SLOTS, SLOT_LABELS } from '../constants';
import { deleteFoodEntry, setDayIncomplete, useDayMark, useFoodEntries } from '../data/food';
import { useEnergy } from '../data/energy';
import { dayTotals, groupBySlot } from '../logic/food';
import type { FoodEntry } from '../types';
import { EnergyBreakdown } from './EnergyBreakdown';
import { whole } from './format';
import { RingsPanel } from './RingsPanel';
import { useToday } from './useToday';

const dayPath = (date: LocalDate, today: LocalDate) => (date === today ? '/nutrition' : `/nutrition/day/${date}`);

function EntryRow({ entry }: { entry: FoodEntry }) {
  const remove = async () => {
    try {
      await deleteFoodEntry(entry);
    } catch (e) {
      toast.show({ message: `Could not delete the entry: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };
  return (
    <li className="flex items-center justify-between gap-2 border-b border-line last:border-0">
      <AppLink to={`/nutrition/add?entry=${encodeURIComponent(entry.id)}`} className="tap flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate">{entry.name}</span>
        <span className="text-xs text-muted tabular-nums">
          {whole(entry.kcal)} kcal
          {entry.protein !== undefined ? ` · P ${whole(entry.protein)} g` : ''}
          {entry.carbs !== undefined ? ` · C ${whole(entry.carbs)} g` : ''}
          {entry.fat !== undefined ? ` · F ${whole(entry.fat)} g` : ''}
        </span>
      </AppLink>
      <Button variant="ghost" aria-label={`Delete ${entry.name}`} onClick={() => void remove()}>
        Delete
      </Button>
    </li>
  );
}

/** Nutrition tab root (today) and `/nutrition/day/:date`: rings, energy, meal slots and totals (R31, R32). */
export default function FoodLogScreen() {
  const params = useParams();
  const today = useToday();
  const navigate = useAppNavigate();
  const date: LocalDate = params['date'] ?? today;
  const entries = useFoodEntries(date);
  const energy = useEnergy(today);
  const incomplete = useDayMark(date);

  if (!isLocalDate(date)) return <Navigate to="/nutrition" replace />;
  if (entries.failed) return <ErrorPanel message="The food log could not be loaded." onRetry={entries.retry} />;
  if (entries.value === undefined) return <Skeleton rows={5} />;

  const totals = dayTotals(entries.value);
  const groups = groupBySlot(entries.value);
  const ready = energy.value?.status === 'ready' ? energy.value : undefined;
  const missing = energy.failed ? 'error' : 'profile';
  const go = (d: LocalDate) => navigate(dayPath(d, today));
  const toggle = async (value: boolean) => {
    try {
      await setDayIncomplete(date, value);
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
          ‹
        </Button>
        <h1 className="text-center text-xl font-semibold">
          {date === today ? 'Today' : date}
          {date === today ? <span className="block text-sm font-normal text-muted">{date}</span> : null}
        </h1>
        <Button variant="secondary" aria-label="Next day" onClick={() => go(addDays(date, 1))}>
          ›
        </Button>
      </div>

      {incomplete.value === true ? (
        <p role="status" className="rounded-continuous bg-surface-2 px-3 py-2 text-sm">
          Marked incomplete: this day is not used for burn correction.
        </p>
      ) : null}

      <CardFrame aria-label="Progress">
        <RingsPanel
          totals={totals}
          calorieTarget={ready?.energy.calorieTarget}
          proteinTarget={ready?.energy.proteinTarget}
          missing={missing}
        />
        <p className="mt-3 text-sm tabular-nums text-muted">
          Totals: {whole(totals.kcal)} kcal · P {whole(totals.protein)} g · C {whole(totals.carbs)} g · F {whole(totals.fat)} g
        </p>
      </CardFrame>

      <AppLink to={`/nutrition/scan?date=${date}`} className="tap flex items-center justify-center rounded-continuous bg-accent px-4 py-2 font-medium text-accent-fg">
        Scan barcode
      </AppLink>
      {MEAL_SLOTS.map((slot) => (
        <CardFrame key={slot} aria-label={SLOT_LABELS[slot]}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{SLOT_LABELS[slot]}</h2>
            <AppLink to={`/nutrition/add?date=${date}&slot=${slot}`} aria-label={`Add food to ${SLOT_LABELS[slot]}`} className="tap flex items-center px-2 text-accent underline">
              Add food
            </AppLink>
          </div>
          {groups[slot].length === 0 ? (
            <p className="text-sm text-muted">Nothing logged.</p>
          ) : (
            <ul className="flex flex-col">
              {groups[slot].map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </CardFrame>
      ))}

      <CardFrame>
        <Switch label="Mark day incomplete" checked={incomplete.value === true} onChange={(v) => void toggle(v)} />
      </CardFrame>

      <CardFrame aria-label="Energy">
        <h2 className="mb-2 text-base font-semibold">Energy</h2>
        {energy.failed ? (
          <ErrorPanel message="The energy values could not be computed." onRetry={energy.retry} />
        ) : energy.value === undefined ? (
          <Skeleton rows={3} />
        ) : ready ? (
          <EnergyBreakdown energy={ready.energy} sex={ready.sex} />
        ) : (
          <p className="text-sm text-muted">Add your profile in Settings to see your energy targets.</p>
        )}
      </CardFrame>

      <div className="grid grid-cols-2 gap-2">
        <AppLink to={`/nutrition/meals?date=${date}`} className="tap flex items-center justify-center rounded-continuous bg-surface-2 px-4 font-medium">
          Saved meals
        </AppLink>
        <AppLink to="/nutrition/weight" className="tap flex items-center justify-center rounded-continuous bg-surface-2 px-4 font-medium">
          Weight
        </AppLink>
      </div>
    </section>
  );
}