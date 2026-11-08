import { createElement } from 'react';
import type { ModuleDefinition } from '../../core/registry/types';
import { chessBackup, exportChessData, importChessData } from './data/backup';
import { chessSettings } from './settings';
import { chessTables } from './tables';
import type { ChessBackupData } from './types';

// Stub definition: the Chess tasks replace the icon, screens, card, export/import and backup schema.


function ChessIcon({ className }: { className?: string }) {
  return createElement(
    'svg',
    { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
    createElement('path', { d: 'M9 3h6M12 3v4M8 21h8M9 21l1-10h4l1 10M8 7h8l-1 4H9z' }),
  );
}

function ChessHomeScreen() {
  return createElement('section', null, createElement('h1', null, 'Chess'));
}

function ChessDashboardCard() {
  return createElement('article', null, createElement('h2', null, 'Chess'));
}

export const chessModule: ModuleDefinition<ChessBackupData> = {
  id: 'chess',
  name: 'Chess',
  icon: ChessIcon,
  routes: [{ path: '/chess', Component: ChessHomeScreen, tabRoot: true, title: 'Chess' }],
  DashboardCard: ChessDashboardCard,
  tables: chessTables,
  exportData: exportChessData,
  importData: importChessData,
  backup: chessBackup,
  settings: chessSettings,
};
