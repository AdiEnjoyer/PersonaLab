import { AppLink } from '../../../app/AppLink';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { useEnergy } from '../data/energy';
import { useFoodEntries } from '../data/food';
import { dayTotals } from '../logic/food';
import { RingsPanel } from './RingsPanel';
import { useToday } from './useToday';

/** Nutrition card of the Home_Dashboard: today's rings and an "Add food" action (R32.4, R32.5, R32.8). */
export default function NutritionDashboardCard() {
  const today = useToday();
  const entries = useFoodEntries(today);
  const energy = useEnergy(today);
  const navigate = useAppNavigate();
  if (entries.failed) return <ErrorPanel message="The nutrition summary could not be loaded." onRetry={entries.retry} />;
  if (entries.value === undefined) return <Skeleton rows={3} />;
  const ready = energy.value?.status === 'ready' ? energy.value.energy : undefined;
  return (
    <CardFrame aria-label="Nutrition" className="flex flex-col gap-3">
      {/* A tap outside the links and buttons opens today's Food_Log (R32.5); links inside stay real links. */}
      <div
        className="flex flex-col gap-2"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a,button')) navigate('/nutrition');
        }}
      >
        <h2 className="text-lg font-semibold">
          <AppLink to="/nutrition">Nutrition</AppLink>
        </h2>
        <RingsPanel
          totals={dayTotals(entries.value)}
          calorieTarget={ready?.calorieTarget}
          proteinTarget={ready?.proteinTarget}
          missing={energy.failed ? 'error' : 'profile'}
          size={72}
        />
      </div>
      <div>
        <Button onClick={() => navigate(`/nutrition/add?date=${today}`)}>Add food</Button>
      </div>
    </CardFrame>
  );
}
