import type { ModuleDefinition } from '../registry/types';

/**
 * The parts of a module definition the Backup_Service uses. Every `ModuleDefinition` is one, so the App
 * passes `MODULES`; tests pass small table-backed or fake modules.
 */
export type BackupModule = Pick<ModuleDefinition, 'id' | 'name' | 'tables' | 'exportData' | 'importData' | 'backup' | 'settings'>;
