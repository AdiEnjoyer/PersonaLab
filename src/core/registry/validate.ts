import type { ModuleDefinition } from './types';

/** R2.5: 1–20 characters, lowercase letters and digits, starting with a letter. */
export const MODULE_ID_PATTERN = /^[a-z][a-z0-9]{0,19}$/;

/** Route paths owned by the core app; they take part in the duplicate-route check. */
export const CORE_ROUTE_PATHS: readonly string[] = ['/', '/settings'];

/** The id under which core route paths are reported. */
export const CORE_PSEUDO_ID = 'core';

export interface RegistryProblem {
  kind: 'invalid-id' | 'duplicate-id' | 'duplicate-route';
  id?: string;
  path?: string;
  declaredBy?: string[];
}

export function isValidModuleId(id: string): boolean {
  return MODULE_ID_PATTERN.test(id);
}

/**
 * Lists every problem that must stop start-up (R2.5), in this order:
 * - `invalid-id`: each distinct invalid id once, in order of first appearance;
 * - `duplicate-id`: each id declared by two or more modules once (exact, case-sensitive), in order of first appearance;
 * - `duplicate-route`: each path declared two or more times (by different modules, by one module twice, or by a
 *   module and the core), in order of first declaration, with every declaring id once in order of first declaration.
 *   Core paths (`/`, `/settings`) are declared first, under the pseudo-id `core`.
 * An empty result means the registry is valid.
 */
export function validateRegistry(mods: readonly Pick<ModuleDefinition, 'id' | 'routes'>[]): RegistryProblem[] {
  const problems: RegistryProblem[] = [];

  const invalid = new Set<string>();
  for (const { id } of mods) {
    if (!isValidModuleId(id) && !invalid.has(id)) {
      invalid.add(id);
      problems.push({ kind: 'invalid-id', id });
    }
  }

  const idCounts = new Map<string, number>();
  for (const { id } of mods) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) problems.push({ kind: 'duplicate-id', id });
  }

  const declarations = new Map<string, { count: number; declaredBy: string[] }>();
  const declare = (path: string, id: string): void => {
    const entry = declarations.get(path);
    if (entry === undefined) {
      declarations.set(path, { count: 1, declaredBy: [id] });
      return;
    }
    entry.count += 1;
    if (!entry.declaredBy.includes(id)) entry.declaredBy.push(id);
  };
  for (const path of CORE_ROUTE_PATHS) declare(path, CORE_PSEUDO_ID);
  for (const mod of mods) {
    for (const route of mod.routes) declare(route.path, mod.id);
  }
  for (const [path, { count, declaredBy }] of declarations) {
    if (count > 1) problems.push({ kind: 'duplicate-route', path, declaredBy });
  }

  return problems;
}
