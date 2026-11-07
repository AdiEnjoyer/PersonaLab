import type { ComponentType } from 'react';
import type { CommandEntry, ModuleDefinition, ModuleId, ModuleRoute } from './types';

/** One navigation tab per module (R2.3). */
export interface DerivedTab {
  moduleId: ModuleId;
  name: string;
  icon: ModuleDefinition['icon'];
  /** The module's `tabRoot` route path, else its first route path, else `null` when it declares no routes. */
  path: string | null;
}

export interface DerivedRoute extends ModuleRoute {
  moduleId: ModuleId;
}

export interface DerivedCard {
  moduleId: ModuleId;
  name: string;
  DashboardCard: ComponentType;
}

/** A module's live command-entry hook; modules without one are left out (R2.3). */
export interface CommandSource {
  moduleId: ModuleId;
  useCommandEntries: () => CommandEntry[];
}

/** Tabs in registry order, one per module. */
export function deriveTabs(mods: readonly Pick<ModuleDefinition, 'id' | 'name' | 'icon' | 'routes'>[]): DerivedTab[] {
  return mods.map((mod) => {
    const target = mod.routes.find((route) => route.tabRoot === true) ?? mod.routes[0];
    return { moduleId: mod.id, name: mod.name, icon: mod.icon, path: target?.path ?? null };
  });
}

/** Every declared route, modules in registry order and each module's routes in declaration order. */
export function deriveRoutes(mods: readonly Pick<ModuleDefinition, 'id' | 'routes'>[]): DerivedRoute[] {
  return mods.flatMap((mod) => mod.routes.map((route) => ({ ...route, moduleId: mod.id })));
}

/** One Home_Dashboard card per module, in registry order. */
export function deriveCards(mods: readonly Pick<ModuleDefinition, 'id' | 'name' | 'DashboardCard'>[]): DerivedCard[] {
  return mods.map((mod) => ({ moduleId: mod.id, name: mod.name, DashboardCard: mod.DashboardCard }));
}

/** The command-entry hooks of the modules that declare one, in registry order. */
export function deriveCommandSources(
  mods: readonly Pick<ModuleDefinition, 'id' | 'useCommandEntries'>[],
): CommandSource[] {
  const sources: CommandSource[] = [];
  for (const mod of mods) {
    if (mod.useCommandEntries !== undefined) {
      sources.push({ moduleId: mod.id, useCommandEntries: mod.useCommandEntries });
    }
  }
  return sources;
}
