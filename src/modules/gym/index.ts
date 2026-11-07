import { createElement } from 'react';
import { z } from 'zod';
import type { ModuleDefinition } from '../../core/registry/types';
import { gymTables } from './tables';

// Stub definition: the Gym tasks replace the icon, screens, card, export/import and backup schema.

const gymBackupSchema = z.object({});
type GymBackupData = z.infer<typeof gymBackupSchema>;

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
  exportData: async () => ({}),
  importData: async () => undefined,
  backup: { dataVersion: 1, schema: gymBackupSchema, migrations: {}, sections: () => [] },
};
