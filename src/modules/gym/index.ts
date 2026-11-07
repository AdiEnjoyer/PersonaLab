import Dexie from 'dexie';
import { createElement, lazy, Suspense } from 'react';
import type { ModuleDefinition } from '../../core/registry/types';
import { exportGymData, gymBackup, importGymData } from './data/backup';
import { gymSettings } from './settings';
import { gymTables } from './tables';
import type { GymBackupData } from './types';

// Everything reachable from here avoids static imports of the database (core/db/db imports the registry, which imports this file); screens, card, overlay and capability load their data code lazily.
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

const SessionLogger = lazy(() => import('./ui/SessionLogger'));
const SessionSummary = lazy(() => import('./ui/SessionSummary'));
const HistoryScreen = lazy(() => import('./ui/HistoryScreen'));
const SessionDetailScreen = lazy(() => import('./ui/SessionDetailScreen'));
const ChartScreen = lazy(() => import('./ui/ChartScreen'));
const SplitScreen = lazy(() => import('./ui/SplitScreen'));
const LazyDashboardCard = lazy(() => import('./ui/GymDashboardCard'));
const LazyOverlay = lazy(() => import('./ui/GymOverlay'));
const LazyStartupPrompt = lazy(() => import('./ui/GymStartupPrompt'));
function GymDashboardCard() {
  return createElement(Suspense, { fallback: createElement('article', null, createElement('h2', null, 'Gym')) }, createElement(LazyDashboardCard));
}
function GymOverlay() {
  return createElement(Suspense, { fallback: null }, createElement(LazyOverlay));
}
function GymStartupPrompt() {
  return createElement(Suspense, { fallback: null }, createElement(LazyStartupPrompt));
}

export const gymModule: ModuleDefinition<GymBackupData> = {
  id: 'gym',
  name: 'Gym',
  icon: GymIcon,
  routes: [
    { path: '/gym', Component: GymHome, tabRoot: true, title: 'Gym' },
    { path: '/gym/library', Component: LibraryScreen, title: 'Exercises' },
    { path: '/gym/library/:exerciseId', Component: ExerciseDetailScreen, title: 'Exercise' },
    { path: '/gym/library/:exerciseId/chart', Component: ChartScreen, title: 'Progress' },
    { path: '/gym/exercises/new', Component: CustomExerciseForm, title: 'New exercise' },
    { path: '/gym/exercises/:exerciseId/edit', Component: CustomExerciseForm, title: 'Edit exercise' },
    { path: '/gym/routines', Component: RoutineListScreen, title: 'Routines' },
    { path: '/gym/routines/:routineId', Component: RoutineEditorScreen, title: 'Routine' },
    { path: '/gym/session', Component: SessionLogger, title: 'Workout' },
    { path: '/gym/summary/:sessionId', Component: SessionSummary, title: 'Summary' },
    { path: '/gym/history', Component: HistoryScreen, title: 'History' },
    { path: '/gym/history/:sessionId', Component: SessionDetailScreen, title: 'Session' },
    { path: '/gym/split', Component: SplitScreen, title: 'Split analysis' },
  ],
  DashboardCard: GymDashboardCard,
  tables: gymTables,
  exportData: exportGymData,
  importData: importGymData,
  backup: gymBackup,
  settings: gymSettings,
  Overlay: GymOverlay,
  StartupPrompt: GymStartupPrompt,
  lifecycle: {
    async flushPendingWrites() {
      await (await import('./data/activeStore')).flushActiveSession();
    },
  },
  provides: {
    trainingLog: {
      // Dexie.Promise keeps the caller's live-query zone across the dynamic import, so a liveQuery that calls
      // this (Nutrition energy values) is re-run when gym_sessions changes; a native await would drop the zone.
      listFinishedSessions() {
        return Dexie.Promise.resolve(import('./data/trainingLog')).then((m) => m.listFinishedSessions());
      },
    },
  },
};
