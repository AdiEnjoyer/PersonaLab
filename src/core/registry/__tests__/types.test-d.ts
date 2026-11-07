/**
 * Type-level tests for the registry types (R2.1). This file is checked by `tsc` in `npm run typecheck`:
 * every `// @ts-expect-error` below must hit a real error (a definition missing a required field), or the
 * typecheck fails with "Unused '@ts-expect-error' directive".
 */
import { z } from 'zod';
import type { CommandEntry, ModuleBackup, ModuleDefinition, ModuleRoute, ModuleSettings } from '../types';

const Icon = (_props: { className?: string }) => null;
const Card = () => null;
const Screen = () => null;
const routes: ModuleRoute[] = [{ path: '/demo', Component: Screen, title: 'Demo', tabRoot: true }];
const tables = { items: '&id' };
const exportData = async (): Promise<{ items: string[] }> => ({ items: [] });
const importData = async (_data: { items: string[] }): Promise<void> => undefined;
const backup: ModuleBackup<{ items: string[] }> = {
  dataVersion: 1,
  schema: z.object({ items: z.array(z.string()) }),
  migrations: {},
  sections: (data) => [{ name: 'items', records: data.items }],
};

// ---- A complete definition type-checks, with and without the optional fields ----

export const complete: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', icon: Icon, routes, DashboardCard: Card, tables, exportData, importData, backup,
};

export const withOptionals: ModuleDefinition<{ items: string[] }> = {
  ...complete,
  useCommandEntries: () => [],
  settings: { schema: { limit: z.number() }, defaults: { limit: 1 }, Section: Screen },
  Overlay: Screen,
  StartupPrompt: Screen,
  lifecycle: { flushPendingWrites: async () => undefined },
  provides: { trainingLog: { listFinishedSessions: async () => [] } },
};

/** A typed definition is assignable to the registry's element type. */
export const asRegistryEntry: readonly ModuleDefinition[] = [complete, withOptionals];

// ---- Each required ModuleDefinition field is enforced ----

// @ts-expect-error id is required
export const missingId: ModuleDefinition<{ items: string[] }> = {
  name: 'Demo', icon: Icon, routes, DashboardCard: Card, tables, exportData, importData, backup,
};
// @ts-expect-error name is required
export const missingName: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', icon: Icon, routes, DashboardCard: Card, tables, exportData, importData, backup,
};
// @ts-expect-error icon is required
export const missingIcon: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', routes, DashboardCard: Card, tables, exportData, importData, backup,
};
// @ts-expect-error routes is required
export const missingRoutes: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', icon: Icon, DashboardCard: Card, tables, exportData, importData, backup,
};
// @ts-expect-error DashboardCard is required
export const missingCard: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', icon: Icon, routes, tables, exportData, importData, backup,
};
// @ts-expect-error tables is required
export const missingTables: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', icon: Icon, routes, DashboardCard: Card, exportData, importData, backup,
};
// @ts-expect-error exportData is required
export const missingExport: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', icon: Icon, routes, DashboardCard: Card, tables, importData, backup,
};
// @ts-expect-error importData is required
export const missingImport: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', icon: Icon, routes, DashboardCard: Card, tables, exportData, backup,
};
// @ts-expect-error backup is required
export const missingBackup: ModuleDefinition<{ items: string[] }> = {
  id: 'demo', name: 'Demo', icon: Icon, routes, DashboardCard: Card, tables, exportData, importData,
};

// ---- Required fields of the nested types ----

// @ts-expect-error path is required
export const routeMissingPath: ModuleRoute = { Component: Screen, title: 'Demo' };
// @ts-expect-error Component is required
export const routeMissingComponent: ModuleRoute = { path: '/demo', title: 'Demo' };
// @ts-expect-error title is required
export const routeMissingTitle: ModuleRoute = { path: '/demo', Component: Screen };

// @ts-expect-error dataVersion is required
export const backupMissingVersion: ModuleBackup<unknown> = { schema: z.unknown(), migrations: {}, sections: () => [] };
// @ts-expect-error schema is required
export const backupMissingSchema: ModuleBackup<unknown> = { dataVersion: 1, migrations: {}, sections: () => [] };
// @ts-expect-error migrations is required
export const backupMissingMigrations: ModuleBackup<unknown> = { dataVersion: 1, schema: z.unknown(), sections: () => [] };
// @ts-expect-error sections is required
export const backupMissingSections: ModuleBackup<unknown> = { dataVersion: 1, schema: z.unknown(), migrations: {} };

// @ts-expect-error id is required
export const commandMissingId: CommandEntry = { name: 'Go', type: 'Screen', run: () => undefined };
// @ts-expect-error name is required
export const commandMissingName: CommandEntry = { id: 'go', type: 'Screen', run: () => undefined };
// @ts-expect-error type is required
export const commandMissingType: CommandEntry = { id: 'go', name: 'Go', run: () => undefined };
// @ts-expect-error run is required
export const commandMissingRun: CommandEntry = { id: 'go', name: 'Go', type: 'Screen' };
// @ts-expect-error type must be one of the listed entry types
export const commandBadType: CommandEntry = { id: 'go', name: 'Go', type: 'Food', run: () => undefined };

// @ts-expect-error Section is required
export const settingsMissingSection: ModuleSettings = { schema: {}, defaults: {} };

// ---- The required key set of ModuleDefinition is exactly the R2.1 list plus `backup` ----

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

export const requiredKeysAreExact: Equal<
  RequiredKeys<ModuleDefinition>,
  'id' | 'name' | 'icon' | 'routes' | 'DashboardCard' | 'tables' | 'exportData' | 'importData' | 'backup'
> = true;
