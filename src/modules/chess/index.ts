import { createElement, lazy, Suspense } from 'react';
import type { ModuleDefinition } from '../../core/registry/types';
import { chessBackup, exportChessData, importChessData } from './data/backup';
import { chessSettings } from './settings';
import { chessTables } from './tables';
import type { ChessBackupData } from './types';

// Everything reachable from here avoids static imports of the database (core/db/db imports the registry, which imports this file); screens and the card load their data code lazily.

function ChessIcon({ className }: { className?: string }) {
  return createElement(
    'svg',
    { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
    createElement('path', { d: 'M9 3h6M12 3v4M8 21h8M9 21l1-10h4l1 10M8 7h8l-1 4H9z' }),
  );
}

const ChessHome = lazy(() => import('./ui/ChessHome'));
const BoardScreen = lazy(() => import('./ui/BoardScreen'));
const TipsScreen = lazy(() => import('./ui/TipsScreen'));
const GamesScreen = lazy(() => import('./ui/GamesScreen'));
const GameViewerScreen = lazy(() => import('./ui/GameViewerScreen'));
const PuzzlesScreen = lazy(() => import('./ui/ComingSoon').then((m) => ({ default: m.PuzzlesScreen })));
const OpeningsScreen = lazy(() => import('./ui/ComingSoon').then((m) => ({ default: m.OpeningsScreen })));
const AnalysisScreen = lazy(() => import('./ui/ComingSoon').then((m) => ({ default: m.AnalysisScreen })));
const LazyDashboardCard = lazy(() => import('./ui/ChessDashboardCard'));

function ChessDashboardCard() {
  return createElement(Suspense, { fallback: createElement('article', null, createElement('h2', null, 'Chess')) }, createElement(LazyDashboardCard));
}

export const chessModule: ModuleDefinition<ChessBackupData> = {
  id: 'chess',
  name: 'Chess',
  icon: ChessIcon,
  routes: [
    { path: '/chess', Component: ChessHome, tabRoot: true, title: 'Chess' },
    { path: '/chess/games', Component: GamesScreen, title: 'Games' },
    { path: '/chess/games/:gameId', Component: GameViewerScreen, title: 'Game' },
    { path: '/chess/board', Component: BoardScreen, title: 'Board' },
    { path: '/chess/tips', Component: TipsScreen, title: 'Tips' },
    { path: '/chess/puzzles', Component: PuzzlesScreen, title: 'Puzzles' },
    { path: '/chess/openings', Component: OpeningsScreen, title: 'Openings' },
    { path: '/chess/analysis', Component: AnalysisScreen, title: 'Analysis' },
  ],
  DashboardCard: ChessDashboardCard,
  tables: chessTables,
  exportData: exportChessData,
  importData: importChessData,
  backup: chessBackup,
  settings: chessSettings,
};
