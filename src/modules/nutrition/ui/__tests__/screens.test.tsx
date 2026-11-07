import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { addDays, toLocalDate } from '../../../../core/time/localDate';
import { withFreshDb } from '../../../../test/helpers/db';
import { addManualEntry } from '../../data/food';
import { readWeights, saveWeight } from '../../data/weights';
import FoodForm from '../FoodForm';
import FoodLogScreen from '../FoodLogScreen';
import NutritionDashboardCard from '../NutritionDashboardCard';
import NutritionSettingsSection from '../NutritionSettingsSection';
import WeightScreen from '../WeightScreen';

const TODAY = toLocalDate(Date.now());
const profile = { id: 'profile', age: 30, sex: 'male', heightCm: 180, weightKg: 80, weeklyTrainingHours: 4, goal: 'maintain', updatedAt: 1 };

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

describe('Food log screen', () => {
  it('shows the rings with targets, entries under their slot, the energy breakdown and deletes with an Undo', async () => {
    await db.table('core_profile').put(profile);
    await addManualEntry({ name: 'Rice bowl', kcal: 650.4, protein: 20, carbs: 100, fat: 10 }, { date: TODAY, slot: 'lunch', idemKey: 'a' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FoodLogScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Rice bowl')).toBeInTheDocument();
    // BMR 1780 x 1.55 (4 h) = 2759 kcal target at maintain; protein 80 x 1.8 = 144 g.
    expect(await screen.findByText('650 of 2759 kcal')).toBeInTheDocument();
    expect(screen.getByText('20 of 144 g')).toBeInTheDocument();
    expect(screen.getByText('2109 kcal left')).toBeInTheDocument();
    const energy = screen.getByLabelText('Energy breakdown');
    expect(within(energy).getByText('1780 kcal')).toBeInTheDocument();
    expect(within(energy).getByText('4.0 h/week (profile)')).toBeInTheDocument();
    expect(within(energy).getByText('1.55')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Lunch')).getByText('Rice bowl')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Rice bowl' }));
    await waitFor(() => expect(screen.queryByText('Rice bowl')).not.toBeInTheDocument());
    expect(await screen.findByText('0 of 2759 kcal')).toBeInTheDocument();
  });

  it('shows the over-target state and a Settings action without a profile', async () => {
    await addManualEntry({ name: 'Feast', kcal: 5000, protein: 0, carbs: 0, fat: 0 }, { date: TODAY, slot: 'dinner', idemKey: 'a' });
    render(
      <MemoryRouter>
        <FoodLogScreen />
      </MemoryRouter>,
    );
    expect((await screen.findAllByText('Set up your profile in Settings')).length).toBe(2);
    expect(screen.getAllByRole('group', { name: 'Calories' })).toHaveLength(1);
    await db.table('core_profile').put({ ...profile, weightKg: 30, heightCm: 100, age: 100, sex: 'female' });
    // BMR 300 + 625 - 500 - 161 = 264; x1.55 = 409 -> floor 1200; 5000 is far over.
    expect(await screen.findByText('Over target by 3800 kcal')).toBeInTheDocument();
    expect(screen.getByText(/raised to the minimum of 1200 kcal/)).toBeInTheDocument();
  });

  it('toggles the incomplete mark', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FoodLogScreen />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('switch', { name: 'Mark day incomplete' }));
    expect(await screen.findByText(/Marked incomplete/)).toBeInTheDocument();
    expect(await db.table('nutrition_dayMarks').get(TODAY)).toEqual({ date: TODAY, incomplete: true });
  });
});

describe('Add food form', () => {
  it('shows inline errors, keeps the values, then saves one entry', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/nutrition/add?date=${TODAY}&slot=snacks`]}>
        <Routes>
          <Route path="/nutrition/add" element={<FoodForm />} />
          <Route path="/nutrition" element={<p>log</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText('Name'), 'Apple');
    await user.type(screen.getByLabelText(/Energy/), '6000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Enter kcal from 0 to 5000/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Apple');
    expect(await db.table('nutrition_foodEntries').count()).toBe(0);
    await user.clear(screen.getByLabelText(/Energy/));
    await user.type(screen.getByLabelText(/Energy/), '95');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('log')).toBeInTheDocument();
    const stored = await db.table('nutrition_foodEntries').toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Apple', kcal: 95, protein: 0, slot: 'snacks', date: TODAY, source: 'manual' });
  });
});

describe('Weight screen', () => {
  it('adds a weigh-in with validation, replaces one on the same date with Undo available, and shows the empty state', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WeightScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No weigh-ins in this range')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Add weight' })[0]!);
    await user.type(screen.getByLabelText(/^Weight/), '29.9');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Enter a weight from 30.0 to 300.0 kg/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Weight/));
    await user.type(screen.getByLabelText(/^Weight/), '81,5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await readWeights()).map((w) => w.weightKg)).toEqual([81.5]));
    expect(await screen.findByText(`${TODAY} · 81.5 kg`)).toBeInTheDocument();
    await saveWeight({ idemKey: 'x', date: TODAY, weightKg: 80 });
    expect(await screen.findByText(`${TODAY} · 80.0 kg`)).toBeInTheDocument();
  });
});

describe('Dashboard card', () => {
  it('shows the rings and an Add food action', async () => {
    await db.table('core_profile').put(profile);
    await addManualEntry({ name: 'Egg', kcal: 100, protein: 10, carbs: 0, fat: 0 }, { date: TODAY, slot: 'breakfast', idemKey: 'a' });
    render(
      <MemoryRouter>
        <NutritionDashboardCard />
      </MemoryRouter>,
    );
    expect(await screen.findByText('100 of 2759 kcal')).toBeInTheDocument();
    expect(screen.getByText('10 of 144 g')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add food' })).toBeInTheDocument();
  });
});

describe('Nutrition settings', () => {
  it('rejects an off-step adjustment with the accepted values and keeps the stored one, accepts a valid one', async () => {
    const user = userEvent.setup();
    render(<NutritionSettingsSection />);
    const field = await screen.findByLabelText(/Cut calorie adjustment/);
    await user.clear(field);
    await user.type(field, '-525');
    await user.tab();
    expect(await screen.findByText(/Accepted values: .*1000 to \+1000 kcal, in steps of 50 kcal/)).toBeInTheDocument();
    expect(await db.table('core_settings').get('nutrition.goalAdjust')).toBeUndefined();
    await user.clear(field);
    await user.type(field, '-450');
    await user.tab();
    await waitFor(async () => expect((await db.table('core_settings').get('nutrition.goalAdjust'))?.value.cut).toBe(-450));

    const factor = screen.getByLabelText(/Bulk protein factor/);
    await user.clear(factor);
    await user.type(factor, '2.3');
    await user.tab();
    expect(await screen.findByText(/1.6 to 2.2 g\/kg/, { selector: 'p[role="alert"]' })).toBeInTheDocument();
  });

  it('resets the burn offset', async () => {
    await db.table('nutrition_state').put({ key: 'burnOffset', value: -120 });
    const user = userEvent.setup();
    render(<NutritionSettingsSection />);
    expect(await screen.findByText(/Current offset: -120 kcal/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset burn offset' }));
    expect(await screen.findByText(/Current offset: 0 kcal/)).toBeInTheDocument();
  });
});
describe('Burn correction card', () => {
  const seed = async () => {
    await db.table('core_profile').put(profile);
    for (let k = 1; k <= 21; k++) {
      const date = addDays(TODAY, -k);
      await saveWeight({ idemKey: `w${k}`, date, weightKg: 80 });
      await addManualEntry({ name: 'Food', kcal: 2200, protein: 0, carbs: 0, fat: 0 }, { date, slot: 'lunch', idemKey: `f${k}` });
    }
  };

  it('suggests a burn from the weight trend and Accept replaces the Burn_Offset', async () => {
    await seed();
    await db.table('nutrition_state').put({ key: 'burnOffset', value: 40 });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WeightScreen />
      </MemoryRouter>,
    );
    const card = await screen.findByLabelText('Burn correction', {}, { timeout: 5000 });
    expect(within(card).getByText('2200 kcal')).toBeInTheDocument();
    expect(within(card).getByText(/weight change 0.00 kg over 14 days · 21 days of data/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Accept' }));
    // TDEE 2759: offset = round(2200 - 2759), replacing the old +40.
    await waitFor(async () => expect((await db.table('nutrition_state').get('burnOffset')).value).toBe(-559));
    await waitFor(() => expect(screen.queryByLabelText('Burn correction')).not.toBeInTheDocument());
  }, 20_000);

  it('Ignore hides the suggestion for 7 days and keeps the offset', async () => {
    await seed();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WeightScreen />
      </MemoryRouter>,
    );
    const card = await screen.findByLabelText('Burn correction', {}, { timeout: 5000 });
    await user.click(within(card).getByRole('button', { name: 'Ignore' }));
    await waitFor(async () => expect((await db.table('nutrition_state').get('trendIgnoreUntil')).value).toBe(addDays(TODAY, 7)));
    await waitFor(() => expect(screen.queryByLabelText('Burn correction')).not.toBeInTheDocument());
    expect(await db.table('nutrition_state').get('burnOffset')).toBeUndefined();
  }, 20_000);

  it('lists shortfalls when there is too little data', async () => {
    await db.table('core_profile').put(profile);
    await saveWeight({ idemKey: 'w', date: addDays(TODAY, -3), weightKg: 80 });
    render(
      <MemoryRouter>
        <WeightScreen />
      </MemoryRouter>,
    );
    const card = await screen.findByLabelText('Burn correction', {}, { timeout: 5000 });
    expect(within(card).getByText('11 more days of weight history')).toBeInTheDocument();
  }, 20_000);
});