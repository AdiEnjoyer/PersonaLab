import type { ComponentType } from 'react';
import type { ZodType } from 'zod';
import type { Capabilities } from './capabilities';

/** 1–20 characters, lowercase a–z and digits 0–9, starting with a letter: /^[a-z][a-z0-9]{0,19}$/ (R2.5). */
export type ModuleId = string;

export interface ModuleRoute {
  /** Absolute app path, e.g. "/gym/routines/:routineId". */
  path: string;
  /** Usually React.lazy(...). */
  Component: ComponentType;
  /** Exactly one per module: the tab's start screen. */
  tabRoot?: boolean;
  /** Header title. */
  title: string;
}

export interface CommandContext {
  navigate(to: string): void;
  online: boolean;
}

export interface CommandEntry {
  /** Unique within the module, e.g. "exercise:Barbell_Squat". */
  id: string;
  name: string;
  type: 'Screen' | 'Action' | 'Exercise' | 'Routine' | 'Saved meal' | 'Repertoire tree';
  /** Navigate or perform the action. */
  run(ctx: CommandContext): void | Promise<void>;
  /** Checked before running (R72.8). */
  exists?(): Promise<boolean>;
  /** R72.6 */
  needsNetwork?: boolean;
}

export interface ModuleBackup<TData> {
  /** Current Module data version. */
  dataVersion: number;
  /** Validates a migrated module entry. */
  schema: ZodType<TData>;
  /** Key `v` migrates data version v → v + 1. */
  migrations: Record<number, (data: unknown) => unknown>;
  /** Record order for R7.5 positions and R7.8 counts. */
  sections(data: TData): Array<{ name: string; records: unknown[] }>;
}

export interface ModuleSettings {
  /** Keys are stored as `${moduleId}.${key}` in core_settings. */
  schema: Record<string, ZodType>;
  defaults: Record<string, unknown>;
  /** Rendered in the Settings_Screen. */
  Section: ComponentType;
}

export interface ModuleDefinition<TData = unknown> {
  id: ModuleId;
  name: string;
  icon: ComponentType<{ className?: string }>;
  routes: ModuleRoute[];
  DashboardCard: ComponentType;
  /** Short name → Dexie index spec; stored as `${id}_${short}` (R2.6). */
  tables: Record<string, string>;
  exportData(): Promise<TData>;
  /** Runs inside the caller's Dexie transaction zone. */
  importData(data: TData): Promise<void>;
  backup: ModuleBackup<TData>;
  /** Optional, live (R2.3). */
  useCommandEntries?: () => CommandEntry[];
  settings?: ModuleSettings;
  /** Always-mounted UI, e.g. the Active Session link (R20.7). */
  Overlay?: ComponentType;
  /** E.g. the Gym resume prompt (R21.2). */
  StartupPrompt?: ComponentType;
  /** Awaited before an update reload (R10.4). */
  lifecycle?: { flushPendingWrites?(): Promise<void> };
  provides?: Partial<Capabilities>;
}
