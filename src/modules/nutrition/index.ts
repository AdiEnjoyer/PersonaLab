import { createElement } from 'react';
import type { ModuleDefinition } from '../../core/registry/types';
import { exportNutritionData, importNutritionData, nutritionBackup } from './data/backup';
import type { NutritionBackupData } from './types';
import { nutritionSettings } from './settings';
import { nutritionTables } from './tables';

// Stub definition: the Nutrition tasks replace the icon, screens, card, export/import and backup schema.


function NutritionIcon({ className }: { className?: string }) {
  return createElement(
    'svg',
    { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
    createElement('path', { d: 'M12 21c-4 0-7-3-7-7 0-4 3-7 7-7s7 3 7 7c0 4-3 7-7 7zM12 7c0-2 1-4 3-4' }),
  );
}

function NutritionTodayScreen() {
  return createElement('section', null, createElement('h1', null, 'Nutrition'));
}

function NutritionDashboardCard() {
  return createElement('article', null, createElement('h2', null, 'Nutrition'));
}

export const nutritionModule: ModuleDefinition<NutritionBackupData> = {
  id: 'nutrition',
  name: 'Nutrition',
  icon: NutritionIcon,
  routes: [{ path: '/nutrition', Component: NutritionTodayScreen, tabRoot: true, title: 'Nutrition' }],
  DashboardCard: NutritionDashboardCard,
  tables: nutritionTables,
  exportData: exportNutritionData,
  importData: importNutritionData,
  backup: nutritionBackup,
  settings: nutritionSettings,
};
