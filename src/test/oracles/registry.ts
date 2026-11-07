/**
 * Oracle for Property 3: the problems `validateRegistry` must report for a list of `{ id, routes }`.
 * Independent of production code. Order of the result:
 * - every distinct invalid id once, in order of first appearance;
 * - every id that appears two or more times once, in order of first appearance;
 * - every path declared two or more times (core paths first, under `core`), in order of first declaration,
 *   with each declaring id once, in order of first declaration.
 */
export interface OracleProblem {
  kind: 'invalid-id' | 'duplicate-id' | 'duplicate-route';
  id?: string;
  path?: string;
  declaredBy?: string[];
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

/** 1–20 characters, a–z and 0–9 only, first character a letter; checked character by character. */
function idIsValid(id: string): boolean {
  const chars = [...id];
  if (chars.length !== id.length) return false; // astral characters are never valid
  if (chars.length < 1 || chars.length > 20) return false;
  if (!LOWER.includes(chars[0]!)) return false;
  return chars.every((c) => c.length === 1 && (LOWER.includes(c) || DIGITS.includes(c)));
}

export function registryProblemsOracle(
  mods: ReadonlyArray<{ id: string; routes: ReadonlyArray<{ path: string }> }>,
  corePaths: readonly string[],
  coreId = 'core',
): OracleProblem[] {
  const ids = mods.map((m) => m.id);
  const firstIndex = (list: readonly string[], value: string): number => list.indexOf(value);
  const distinctIds = ids.filter((id, i) => firstIndex(ids, id) === i);

  const invalid: OracleProblem[] = distinctIds.filter((id) => !idIsValid(id)).map((id) => ({ kind: 'invalid-id', id }));
  const duplicated: OracleProblem[] = distinctIds
    .filter((id) => ids.filter((other) => other === id).length >= 2)
    .map((id) => ({ kind: 'duplicate-id', id }));

  const declarations: Array<{ path: string; by: string }> = [
    ...corePaths.map((path) => ({ path, by: coreId })),
    ...mods.flatMap((m) => m.routes.map((r) => ({ path: r.path, by: m.id }))),
  ];
  const paths = declarations.map((d) => d.path);
  const distinctPaths = paths.filter((p, i) => firstIndex(paths, p) === i);
  const routes: OracleProblem[] = distinctPaths
    .filter((p) => paths.filter((other) => other === p).length >= 2)
    .map((path) => {
      const by = declarations.filter((d) => d.path === path).map((d) => d.by);
      return { kind: 'duplicate-route', path, declaredBy: by.filter((id, i) => by.indexOf(id) === i) };
    });

  return [...invalid, ...duplicated, ...routes];
}
