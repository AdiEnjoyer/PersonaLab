import { createElement } from 'react';
import type { ModuleDefinition } from '../../core/registry/types';
import { exportGymData, gymBackup, importGymData } from './data/backup';
import { gymSettings } from './settings';
import { gymTables } from './tables';
import type { GymBackupData } from './types';

// The icon, screens, card and backup are real; the Session_Logger, History and Split routes are added by later steps.
function GymIcon({ className }: { className?: string }) {
  return createElement(
    'svg',
    { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
    createElement('path', { d: 'M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8' }),
  );
}

function GymStartScreen() {
  return createElement('section', null, createElement('h1', null, 'Gym'));
}

function GymDashboardCard() {
  return createElement('article', null, createElement('h2', null, 'Gym'));
}

export const gymModule: ModuleDefinition<GymBackupData> = {
  id: 'gym',
  name: 'Gym',
  icon: GymIcon,
  routes: [{ path: '/gym', Component: GymStartScreen, tabRoot: true, title: 'Gym' }],
  DashboardCard: GymDashboardCard,
  tables: gymTables,
  exportData: exportGymData,
  importData: importGymData,
  backup: gymBackup,
  settings: gymSettings,
};
