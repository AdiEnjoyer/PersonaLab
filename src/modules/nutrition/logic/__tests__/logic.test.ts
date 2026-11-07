import { describe, expect, it } from 'vitest';
import { addDays, startOfLocalDate } from '../../../../core/time/localDate';
import { activityFactor, bmr, computeEnergy, currentWeight, effectiveTrainingHours, loggedTrainingHours } from '../energy';
import { dayTotals, groupBySlot, isLoggedDay, maxMultiplier, scaleMeal, validateFoodForm, validateSavedMealForm } from '../food';
import { ringState } from '../rings';
import { proteinFactorFor } from '../targets';
import { correctedBurn, offsetFromCorrection, suggestionView, trendCorrection } from '../trend';
import { trendAt, trendSeries, validateWeightForm } from '../weight';
import type { FoodEntry, SavedMeal, WeightEntry } from '../../types';

const TODAY = '2025-06-15';
const HOUR = 3_600_000;
const session = (date: string, hours: number) => {
  const startedAt = startOfLocalDate(date) + 12 * HOUR;
  return { startedAt, finishedAt: startedAt + hours * HOUR };
};
const weight = (date: string, weightKg: number): WeightEntry => ({ id: date, idemKey: date, date, weightKg, createdAt: 0 });
const food = (date: string, kcal: number, extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `${date}-${kcal}-${Math.random()}`,
  idemKey: `${date}-${kcal}-${Math.random()}`,
  date,
  slot: 'lunch',
  name: 'x',
  kcal,
  source: 'manual',
  createdAt: 0,
  ...extra,
});

describe('energy', () => {
  it('BMR reference examples', () => {
    expect(bmr({ sex: 'male', heightCm: 180, age: 30 }, 80)).toBe(1780);
    expect(bmr({ sex: 'female', heightCm: 165, age: 25 }, 60)).toBe(1345.25);
  });

  it('activity factor thresholds', () => {
    expect([0, 0.99, 1, 2.99, 3, 4.99, 5, 7.99, 8, 40].map(activityFactor)).toEqual([1.2, 1.2, 1.375, 1.375, 1.55, 1.55, 1.725, 1.725, 1.9, 1.9]);
  });

  it('Logged_Training_Hours reference examples (R29 criterion 12)', () => {
    // N = 7: earliest session 3 days ago; 1 h + 1.5 h + 5 h (capped to 4 h).
    const a = [session(addDays(TODAY, -3), 1), session(addDays(TODAY, -2), 1.5), session(addDays(TODAY, -1), 5)];
    const hours = loggedTrainingHours(a, TODAY);
    expect(hours).toBe(6.5);
    expect(activityFactor(hours)).toBe(1.725);
    // N = 28: earliest session 60 days ago (outside the window, contributes nothing); capped sum in window 12 h.
    const b = [session(addDays(TODAY, -60), 2), session(addDays(TODAY, -20), 4), session(addDays(TODAY, -10), 4), session(addDays(TODAY, -1), 9)];
    const h2 = loggedTrainingHours(b, TODAY);
    expect(h2).toBe(3);
    expect(activityFactor(h2)).toBe(1.55);
  });

  it('negative durations count as 0 and no sessions give 0', () => {
    expect(loggedTrainingHours([], TODAY)).toBe(0);
    const s = session(TODAY, 0);
    expect(loggedTrainingHours([{ startedAt: s.startedAt, finishedAt: s.startedAt - HOUR }], TODAY)).toBe(0);
  });

  it('Effective hours: override > logged (session in last 28 days) > profile', () => {
    const base = { today: TODAY, profileHours: 2, sessions: [session(addDays(TODAY, -5), 2)] };
    expect(effectiveTrainingHours({ ...base, override: { enabled: true, hours: 9 } })).toEqual({ hours: 9, source: 'override' });
    expect(effectiveTrainingHours({ ...base, override: { enabled: false, hours: 9 } }).source).toBe('logged');
    const old = { ...base, sessions: [session(addDays(TODAY, -28), 2)] };
    expect(effectiveTrainingHours({ ...old, override: { enabled: false, hours: 0 } })).toEqual({ hours: 2, source: 'profile' });
  });

  it('currentWeight uses the latest entry not after today, else the Profile weight', () => {
    expect(currentWeight([], TODAY, 80)).toBe(80);
    expect(currentWeight([weight('2025-06-10', 79), weight('2025-06-12', 78), weight('2025-06-20', 70)], TODAY, 80)).toBe(78);
  });

  it('computeEnergy chains BMR, factor, offset and targets', () => {
    const r = computeEnergy({
      profile: { sex: 'male', heightCm: 180, age: 30, weightKg: 80, weeklyTrainingHours: 4, goal: 'cut' },
      weights: [],
      sessions: [],
      today: TODAY,
      override: { enabled: false, hours: 0 },
      burnOffset: -100,
      goalAdjust: { cut: -500, maintain: 0, bulk: 300 },
      proteinFactor: { cut: 'default', maintain: 'default', bulk: 'default' },
    });
    expect(r).toMatchObject({ bmr: 1780, factor: 1.55, hoursSource: 'profile', tdee: 2759, dailyBurn: 2659, calorieTarget: 2159, floored: false, proteinTarget: 176, currentWeight: 80 });
  });

  it('protein factor falls back to the goal default', () => {
    expect(proteinFactorFor('bulk', { cut: 'default', maintain: 'default', bulk: 'default' })).toBe(1.6);
    expect(proteinFactorFor('bulk', { cut: 'default', maintain: 'default', bulk: 2 })).toBe(2);
  });
});

describe('rings', () => {
  it('fills by the unrounded fraction and reports remaining on rounded values', () => {
    expect(ringState(1000.4, 2000)).toEqual({ kind: 'ok', fraction: 1000.4 / 2000, consumed: 1000, target: 2000, remaining: 1000 });
  });
  it('is full and within target when the rounded values are equal', () => {
    expect(ringState(1999.6, 2000)).toMatchObject({ kind: 'ok', remaining: 0, fraction: 1999.6 / 2000 });
    expect(ringState(2000.4, 2000)).toMatchObject({ kind: 'ok', remaining: 0, fraction: 1 });
  });
  it('is over only when the rounded total exceeds the rounded target', () => {
    expect(ringState(2000.6, 2000)).toEqual({ kind: 'over', fraction: 1, consumed: 2001, target: 2000, over: 1 });
  });
  it('has no target when missing or not positive', () => {
    expect(ringState(300.4, undefined)).toEqual({ kind: 'no-target', consumed: 300 });
    expect(ringState(0, 0)).toEqual({ kind: 'no-target', consumed: 0 });
  });
});

describe('food log', () => {
  it('sums totals with missing macros as 0 and groups by slot in creation order', () => {
    const e = [food(TODAY, 100, { slot: 'dinner', createdAt: 2, protein: 5 }), food(TODAY, 50.5, { slot: 'dinner', createdAt: 1 }), food(TODAY, 10, { slot: 'breakfast' })];
    expect(dayTotals(e)).toEqual({ kcal: 160.5, protein: 5, carbs: 0, fat: 0 });
    expect(dayTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const g = groupBySlot(e);
    expect(g.dinner.map((x) => x.kcal)).toEqual([50.5, 100]);
    expect(Object.keys(g)).toEqual(['breakfast', 'lunch', 'dinner', 'snacks']);
  });

  it('Logged_Day needs an entry and no incomplete mark', () => {
    const e = [food(TODAY, 1)];
    expect(isLoggedDay(TODAY, e, [])).toBe(true);
    expect(isLoggedDay(TODAY, e, [{ date: TODAY, incomplete: true }])).toBe(false);
    expect(isLoggedDay('2025-06-14', e, [])).toBe(false);
  });

  it('validates the food form', () => {
    expect(validateFoodForm({ name: ' Oats ', kcal: '350,5', protein: '', carbs: '60', fat: '', grams: '' })).toEqual({
      ok: true,
      value: { name: 'Oats', kcal: 350.5, protein: 0, carbs: 60, fat: 0 },
    });
    const bad = validateFoodForm({ name: '', kcal: '5000.1', protein: '1.25', carbs: '501', fat: 'x', grams: '0.05' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['carbs', 'fat', 'grams', 'kcal', 'name', 'protein']);
  });

  it('validates the Saved_Meal item count and items', () => {
    const item = { name: 'a', kcal: '1', protein: '', carbs: '', fat: '', grams: '' };
    expect(validateSavedMealForm('Meal', []).ok).toBe(false);
    expect(validateSavedMealForm('Meal', Array.from({ length: 51 }, () => item)).ok).toBe(false);
    expect(validateSavedMealForm('Meal', Array.from({ length: 50 }, () => item)).ok).toBe(true);
    const r = validateSavedMealForm('M', [item, { ...item, kcal: '' }]);
    expect(r.ok === false && r.errors.itemErrors[1]?.kcal).toBeTruthy();
  });
});

describe('saved meal scaling', () => {
  const meal: SavedMeal = {
    id: 'm',
    idemKey: 'm',
    name: 'Meal',
    createdAt: 0,
    updatedAt: 0,
    items: [
      { name: 'Rice', kcal: 200, protein: 4, carbs: 44, fat: 0.5, grams: 150 },
      { name: 'Chicken', kcal: 1500, protein: 40, carbs: 0, fat: 8 },
    ],
  };
  it('scales every value, keeps absent grams absent and keys entries by action and index', () => {
    const r = scaleMeal(meal, 1.5, { date: TODAY, slot: 'dinner', actionKey: 'act', now: 100, newId: (() => { let n = 0; return () => `id${n++}`; })() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entries.map((e) => e.idemKey)).toEqual(['act:0', 'act:1']);
    expect(r.entries[0]).toMatchObject({ name: 'Rice', kcal: 300, protein: 6, carbs: 66, fat: 0.75, grams: 225, source: 'saved meal', slot: 'dinner', date: TODAY });
    expect(r.entries[1]).not.toHaveProperty('grams');
  });
  it('reports the first offending item and the largest allowed multiplier', () => {
    expect(maxMultiplier(meal)).toBe(3.25); // 5000 / 1500 = 3.33
    const r = scaleMeal(meal, 3.5, { date: TODAY, slot: 'lunch', actionKey: 'a', now: 0 });
    expect(r).toEqual({ ok: false, firstItem: 'Chicken', maxMultiplier: 3.25 });
    expect(scaleMeal(meal, 3.25, { date: TODAY, slot: 'lunch', actionKey: 'a', now: 0 }).ok).toBe(true);
  });
  it('returns null when even 0.25 exceeds a limit', () => {
    expect(maxMultiplier({ items: [{ name: 'x', kcal: 5000, protein: 0, carbs: 0, fat: 0 }] })).toBe(1);
    expect(maxMultiplier({ items: [{ name: 'x', kcal: 4000 * 8, protein: 0, carbs: 0, fat: 0 }] })).toBeNull();
  });
});

describe('weight trend', () => {
  it('averages the 7 dates ending at d, including entries before the range', () => {
    const w = [weight('2025-06-08', 80), weight('2025-06-10', 79), weight('2025-06-14', 78)];
    expect(trendAt(w, '2025-06-14')).toBeCloseTo((80 + 79 + 78) / 3, 12);
    expect(trendAt(w, '2025-06-15')).toBeCloseTo((79 + 78) / 2, 12);
    expect(trendAt(w, '2025-06-07')).toBeUndefined();
    const series = trendSeries(w, '2025-06-13', '2025-06-15');
    expect(series.map((p) => p.date)).toEqual(['2025-06-13', '2025-06-14', '2025-06-15']);
    expect(series[0]!.value).toBeCloseTo((80 + 79) / 2, 12);
  });
  it('validates the weight form', () => {
    expect(validateWeightForm('80.5', TODAY, TODAY)).toEqual({ ok: true, weightKg: 80.5 });
    expect(validateWeightForm('29.9', TODAY, TODAY).ok).toBe(false);
    expect(validateWeightForm('80.55', TODAY, TODAY).ok).toBe(false);
    expect(validateWeightForm('80', addDays(TODAY, 1), TODAY)).toEqual({ ok: false, errors: { date: expect.any(String) } });
  });
});

describe('trend corrector', () => {
  it('reference example: L = 21, I = 2200, dW = -0.5 gives C = 2475', () => {
    expect(correctedBurn(2200, -0.5, 14)).toBe(2475);
  });

  const yesterday = addDays(TODAY, -1);
  /** 28 days of history ending yesterday, daily weigh-ins with the given drift, food every day. */
  const build = (days: number, drift: number, foodEvery = 1) => {
    const weights: WeightEntry[] = [];
    const foods: FoodEntry[] = [];
    for (let k = 0; k < days; k++) {
      const date = addDays(yesterday, -k);
      weights.push(weight(date, 80 - drift * (days - 1 - k)));
      if (k % foodEvery === 0) foods.push(food(date, 2200));
    }
    return { weights, foods };
  };

  it('computes C from the window ending yesterday and ignores today', () => {
    const { weights, foods } = build(21, 0);
    const r = trendCorrection({ today: TODAY, weights: [...weights, weight(TODAY, 90)], foods: [...foods, food(TODAY, 9000)], marks: [] });
    expect(r).toEqual({ kind: 'computed', L: 21, D: 14, I: 2200, dW: 0, C: 2200 });
  });

  it('uses the first and last 7-day block means', () => {
    const { weights, foods } = build(21, 0.1);
    const r = trendCorrection({ today: TODAY, weights, foods, marks: [] });
    if (r.kind !== 'computed') throw new Error('expected computed');
    expect(r.dW).toBeCloseTo(-1.4, 9); // blocks are 14 days apart at 0.1 kg per day
    expect(r.C).toBeCloseTo(2200 + (1.4 * 7700) / 14, 6);
  });

  it('lists shortfalls', () => {
    expect(trendCorrection({ today: TODAY, weights: [], foods: [], marks: [] })).toEqual({ kind: 'insufficient', L: 0, shortfalls: [{ kind: 'history', missing: 14 }] });
    const short = build(10, 0);
    expect(trendCorrection({ today: TODAY, ...short, marks: [] })).toEqual({ kind: 'insufficient', L: 10, shortfalls: [{ kind: 'history', missing: 4 }] });
    const sparse = build(20, 0, 2); // food every second day: 10 of 20, needs 16
    const withFewWeights = { ...sparse, weights: sparse.weights.filter((_w, i) => i % 7 === 0 || i === 19) };
    const r = trendCorrection({ today: TODAY, ...withFewWeights, marks: [] });
    expect(r.kind).toBe('insufficient');
    if (r.kind === 'insufficient') expect(r.shortfalls.some((s) => s.kind === 'logged' && s.missing === 6)).toBe(true);
  });

  it('excludes incomplete-marked days from Logged_Days', () => {
    const { weights, foods } = build(14, 0);
    // 14 days need ceil(11.2) = 12 logged days; mark 3 days incomplete -> 11 left.
    const marks = [0, 1, 2].map((k) => ({ date: addDays(yesterday, -k), incomplete: true as const }));
    const r = trendCorrection({ today: TODAY, weights, foods, marks });
    expect(r).toEqual({ kind: 'insufficient', L: 14, shortfalls: [{ kind: 'logged', missing: 1 }] });
  });

  it('suggestionView and the stored offset', () => {
    const c = (C: number) => ({ kind: 'computed' as const, L: 21, D: 14, I: 2200, dW: 0, C });
    expect(suggestionView(c(2500), 2000, undefined, TODAY)).toBe('suggest');
    expect(suggestionView(c(2050), 2000, undefined, TODAY)).toBe('close-enough');
    expect(suggestionView(c(1100), 2000, undefined, TODAY)).toBe('out-of-range');
    expect(suggestionView(c(5001), 2000, undefined, TODAY)).toBe('out-of-range');
    expect(suggestionView(c(2500), 2000, addDays(TODAY, 3), TODAY)).toBe('none');
    expect(suggestionView(c(2500), 2000, TODAY, TODAY)).toBe('suggest');
    expect(suggestionView({ kind: 'insufficient', L: 3, shortfalls: [] }, 2000)).toBe('shortfalls');
    expect(offsetFromCorrection(2475.5, 2759)).toBe(-284);
    expect(offsetFromCorrection(2759.4, 2759)).toBe(0);
  });
});