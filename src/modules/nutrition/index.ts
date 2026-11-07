import { createElement, lazy, Suspense } from 'react';
import type { ModuleDefinition } from '../../core/registry/types';
import { exportNutritionData, importNutritionData, nutritionBackup } from './data/backup';
import { nutritionSettings } from './settings';
import { nutritionTables } from './tables';
import type { NutritionBackupData } from './types';

// Everything reachable from here avoids static imports of the database (core/db/db imports the registry, which imports this file); screens and the card load their data code lazily.

function NutritionIcon({ className }: { className?: string }) {
  return createElement(
    'svg',
    { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
    createElement('path', { d: 'M12 21c-4 0-7-3-7-7 0-4 3-7 7-7s7 3 7 7c0 4-3 7-7 7zM12 7c0-2 1-4 3-4' }),
  );
}

const FoodLogScreen = lazy(() => import('./ui/FoodLogScreen'));
const FoodForm = lazy(() => import('./ui/FoodForm'));
const MealsScreen = lazy(() => import('./ui/MealsScreen'));
const MealEditor = lazy(() => import('./ui/MealEditor'));
const WeightScreen = lazy(() => import('./ui/WeightScreen'));
const LazyDashboardCard = lazy(() => import('./ui/NutritionDashboardCard'));

function NutritionDashboardCard() {
  return createElement(Suspense, { fallback: createElement('article', null, createElement('h2', null, 'Nutrition')) }, createElement(LazyDashboardCard));
}

export const nutritionModule: ModuleDefinition<NutritionBackupData> = {
  id: 'nutrition',
  name: 'Nutrition',
  icon: NutritionIcon,
  routes: [
    { path: '/nutrition', Component: FoodLogScreen, tabRoot: true, title: 'Nutrition' },
    { path: '/nutrition/day/:date', Component: FoodLogScreen, title: 'Food log' },
    { path: '/nutrition/add', Component: FoodForm, title: 'Add food' },
    { path: '/nutrition/meals', Component: MealsScreen, title: 'Saved meals' },
    { path: '/nutrition/meals/:mealId', Component: MealEditor, title: 'Meal' },
    { path: '/nutrition/weight', Component: WeightScreen, title: 'Weight' },
  ],
  DashboardCard: NutritionDashboardCard,
  tables: nutritionTables,
  exportData: exportNutritionData,
  importData: importNutritionData,
  backup: nutritionBackup,
  settings: nutritionSettings,
};