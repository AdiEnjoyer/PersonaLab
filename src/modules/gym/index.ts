import { createElement, lazy } from 'react';
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

const GymHome = lazy(() => import('./ui/GymHome'));
const LibraryScreen = lazy(() => import('./ui/LibraryScreen'));
const ExerciseDetailScreen = lazy(() => import('./ui/ExerciseDetailScreen'));
const CustomExerciseForm = lazy(() => import('./ui/CustomExerciseForm'));
const RoutineListScreen = lazy(() => import('./ui/RoutineListScreen'));
const RoutineEditorScreen = lazy(() => import('./ui/RoutineEditorScreen'));

function GymDashboardCard() {
  return createElement('article', null, createElement('h2', null, 'Gym'));
}

export const gymModule: ModuleDefinition<GymBackupData> = {
  id: 'gym',
  name: 'Gym',
  icon: GymIcon,
  routes: [
    { path: '/gym', Component: GymHome, tabRoot: true, title: 'Gym' },
    { path: '/gym/library', Component: LibraryScreen, title: 'Exercises' },
    { path: '/gym/library/:exerciseId', Component: ExerciseDetailScreen, title: 'Exercise' },
    { path: '/gym/exercises/new', Component: CustomExerciseForm, title: 'New exercise' },
    { path: '/gym/exercises/:exerciseId/edit', Component: CustomExerciseForm, title: 'Edit exercise' },
    { path: '/gym/routines', Component: RoutineListScreen, title: 'Routines' },
    { path: '/gym/routines/:routineId', Component: RoutineEditorScreen, title: 'Routine' },
  ],
  DashboardCard: GymDashboardCard,
  tables: gymTables,
  exportData: exportGymData,
  importData: importGymData,
  backup: gymBackup,
  settings: gymSettings,
};
