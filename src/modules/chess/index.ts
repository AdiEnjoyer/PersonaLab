import { createElement } from 'react';
import { z } from 'zod';
import type { ModuleDefinition } from '../../core/registry/types';
import { chessSettings } from './settings';
import { chessTables } from './tables';

// Stub definition: the Chess tasks replace the icon, screens, card, export/import and backup schema.

const chessBackupSchema = z.object({});
type ChessBackupData = z.infer<typeof chessBackupSchema>;

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
  exportData: async () => ({}),
  importData: async () => undefined,
  backup: { dataVersion: 1, schema: chessBackupSchema, migrations: {}, sections: () => [] },
  settings: chessSettings,
};
