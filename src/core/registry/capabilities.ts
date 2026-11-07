import type { ModuleDefinition } from './types';

export interface TrainingSessionSummary {
  startedAt: number;
  finishedAt: number;
}

/** Cross-module services. A module provides them through `provides`; another module reads them here. */
export interface Capabilities {
  trainingLog: {
    /** Finished Sessions only; reads gym tables, safe inside liveQuery. */
    listFinishedSessions(): Promise<TrainingSessionSummary[]>;
  };
}

/**
 * Returns the capability `key` from the first module in `modules` (registry order) that provides it,
 * or `undefined` when no module provides it (e.g. Nutrition then treats Logged_Training_Hours as having
 * no sessions, rule (c) of R29.3).
 */
export function getCapability<K extends keyof Capabilities>(
  key: K,
  modules: readonly Pick<ModuleDefinition, 'provides'>[],
): Capabilities[K] | undefined {
  for (const mod of modules) {
    const capability = mod.provides?.[key];
    if (capability !== undefined) return capability;
  }
  return undefined;
}
