import { liveQuery } from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { undoService } from '../../../../core/undo/undoService';
import { startOfLocalDate, toLocalDate } from '../../../../core/time/localDate';
import { withFreshDb } from '../../../../test/helpers/db';
import type { SavedMeal } from '../../types';
import { addManualEntry, addSavedMealToDay, deleteFoodEntry, readEntriesForDate, setDayIncomplete } from '../food';
import { readEnergy, type EnergyState } from '../energy';
import { setBurnOffset } from '../state';
import { deleteWeight, readWeights, saveWeight } from '../weights';

const TODAY = toLocalDate(Date.now());
const profile = { id: 'profile', age: 30, sex: 'male', heightCm: 180, weightKg: 80, weeklyTrainingHours: 0, goal: 'maintain', updatedAt: 1 };

describe('energy data', () => {
  it('re-emits when a Finished Gym session, a weight, the Profile weight or the Burn_Offset changes (trainingLog capability inside liveQuery)', async () => {
    await withFreshDb(async () => {
      await db.table('core_profile').put(profile);
      const seen: EnergyState[] = [];
      const sub = liveQuery(() => readEnergy(TODAY)).subscribe((v) => seen.push(v));
      try {
        await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
        const ready = () => {
          const last = seen.at(-1)!;
          if (last.status !== 'ready') throw new Error('no profile');
          return last.energy;
        };
        expect(ready()).toMatchObject({ hoursSource: 'profile', bmr: 1780, factor: 1.2 });

        // Gym changes arrive through the dynamically imported capability.
        const startedAt = startOfLocalDate(TODAY) + 3_600_000;
        await db.table('gym_sessions').add({ id: 's1', status: 'finished', startedAt, finishedAt: startedAt + 4 * 3_600_000, lastChangeAt: startedAt, entries: [] });
        await vi.waitFor(() => expect(ready().hoursSource).toBe('logged'), { timeout: 3000 });
        expect(ready().hours).toBeCloseTo(4, 9); // 4 h x 7 / 7

        await db.table('nutrition_weights').add({ id: 'w', idemKey: 'w', date: TODAY, weightKg: 90, createdAt: 1 });
        await vi.waitFor(() => expect(ready().currentWeight).toBe(90), { timeout: 3000 });

        await db.table('nutrition_weights').clear();
        await vi.waitFor(() => expect(ready().currentWeight).toBe(80), { timeout: 3000 });
        await db.table('core_profile').put({ ...profile, weightKg: 70 });
        await vi.waitFor(() => expect(ready().currentWeight).toBe(70), { timeout: 3000 });

        await setBurnOffset(-150);
        await vi.waitFor(() => expect(ready().burnOffset).toBe(-150), { timeout: 3000 });
        expect(ready().dailyBurn).toBeCloseTo(ready().tdee - 150, 9);
      } finally {
        sub.unsubscribe();
      }
    });
  }, 30_000);

  it('reports no profile', async () => {
    await withFreshDb(async () => {
      expect(await readEnergy(TODAY)).toEqual({ status: 'no-profile' });
    });
  });
});

describe('food data', () => {
  it('adds a manual entry once per Idempotency_Key', async () => {
    await withFreshDb(async () => {
      const f = { name: 'Egg', kcal: 70, protein: 6, carbs: 0.5, fat: 5 };
      await Promise.all([addManualEntry(f, { date: TODAY, slot: 'breakfast', idemKey: 'k' }), addManualEntry(f, { date: TODAY, slot: 'breakfast', idemKey: 'k' })]);
      expect(await readEntriesForDate(TODAY)).toHaveLength(1);
    });
  });

  it('adds a Saved_Meal once per action key and deletes with Undo', async () => {
    await withFreshDb(async () => {
      const meal: SavedMeal = {
        id: 'm',
        idemKey: 'm',
        name: 'M',
        createdAt: 0,
        updatedAt: 0,
        items: [
          { name: 'A', kcal: 100, protein: 1, carbs: 2, fat: 3, grams: 50 },
          { name: 'B', kcal: 200, protein: 4, carbs: 5, fat: 6 },
        ],
      };
      const ctx = { date: TODAY, slot: 'dinner' as const, actionKey: 'act1' };
      expect(await addSavedMealToDay(meal, 2, ctx)).toEqual({ ok: true, created: true });
      expect(await addSavedMealToDay(meal, 2, ctx)).toEqual({ ok: true, created: false });
      const entries = await readEntriesForDate(TODAY);
      expect(entries.map((e) => [e.name, e.kcal, e.grams]).sort()).toEqual([['A', 200, 100], ['B', 400, undefined]]);
      expect(await addSavedMealToDay({ items: [{ name: 'Big', kcal: 1500, protein: 0, carbs: 0, fat: 0 }] }, 4, { ...ctx, actionKey: 'act2' })).toEqual({ ok: false, firstItem: 'Big', maxMultiplier: 3.25 });
      expect(await readEntriesForDate(TODAY)).toHaveLength(2);

      await deleteFoodEntry(entries[0]!);
      expect(await readEntriesForDate(TODAY)).toHaveLength(1);
      expect(undoService.getState()).toMatchObject({ status: 'shown', label: 'Food entry deleted' });
      await undoService.undo();
      expect(await readEntriesForDate(TODAY)).toHaveLength(2);
    });
  });

  it('toggles the incomplete mark', async () => {
    await withFreshDb(async () => {
      await setDayIncomplete(TODAY, true);
      expect(await db.table('nutrition_dayMarks').get(TODAY)).toEqual({ date: TODAY, incomplete: true });
      await setDayIncomplete(TODAY, false);
      expect(await db.table('nutrition_dayMarks').get(TODAY)).toBeUndefined();
    });
  });
});

describe('weight data', () => {
  it('keeps one entry per date, replaces with Undo, and deletes with Undo', async () => {
    await withFreshDb(async () => {
      await saveWeight({ idemKey: 'a', date: '2025-06-01', weightKg: 80 });
      await saveWeight({ idemKey: 'a', date: '2025-06-01', weightKg: 80 }); // retried add: no change
      expect(await readWeights()).toHaveLength(1);

      const r = await saveWeight({ idemKey: 'b', date: '2025-06-01', weightKg: 79.5 });
      expect(r.replaced).toBe(true);
      expect((await readWeights()).map((w) => w.weightKg)).toEqual([79.5]);
      await undoService.undo();
      expect((await readWeights()).map((w) => w.weightKg)).toEqual([80]);

      // Editing an entry onto another date replaces the entry there.
      await saveWeight({ idemKey: 'c', date: '2025-06-02', weightKg: 81 });
      const [first, second] = await readWeights();
      await saveWeight({ id: second!.id, idemKey: 'ignored', date: '2025-06-01', weightKg: 82 });
      const after = await readWeights();
      expect(after.map((w) => [w.date, w.weightKg, w.id])).toEqual([['2025-06-01', 82, second!.id]]);
      await undoService.undo();
      expect((await readWeights()).map((w) => [w.date, w.weightKg])).toEqual([['2025-06-01', 80], ['2025-06-02', 81]]);
      expect(first!.id).toBeTruthy();

      await deleteWeight((await readWeights())[0]!);
      expect(await readWeights()).toHaveLength(1);
      await undoService.undo();
      expect(await readWeights()).toHaveLength(2);
    });
  });
});