import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { deriveCards, deriveCommandSources, deriveRoutes, deriveTabs } from '../derive';
import type { CommandEntry, ModuleDefinition, ModuleRoute } from '../types';
import { buildStores, CORE_STORES } from '../../db/tables';

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const DIGITS = '0123456789'.split('');
const alnum = fc.constantFrom(...LOWER, ...DIGITS);

/** Valid module ids (R2.5); `core` is left out because its tables would share the core store names. */
const arbId = fc
  .tuple(fc.constantFrom(...LOWER), fc.string({ unit: alnum, maxLength: 19 }))
  .map(([first, rest]) => first + rest)
  .filter((id) => id !== 'core');

const arbShortName = fc
  .tuple(fc.constantFrom(...LOWER), fc.string({ unit: fc.constantFrom(...LOWER, ...LOWER.map((c) => c.toUpperCase()), ...DIGITS), maxLength: 12 }))
  .map(([first, rest]) => first + rest);

const arbSpec = fc.constantFrom('&id', '&id, &idemKey', '&id, date, createdAt', '&key', '&[a+b], a', '&date');

const Icon = () => null;
const Screen = () => null;
const Card = () => null;

type TestModule = Pick<ModuleDefinition, 'id' | 'name' | 'icon' | 'routes' | 'DashboardCard' | 'tables' | 'useCommandEntries'>;

const arbEntry = (moduleId: string): fc.Arbitrary<CommandEntry> =>
  fc.record({
    id: fc.string({ unit: alnum, minLength: 1, maxLength: 8 }).map((s) => `${moduleId}:${s}`),
    name: fc.string({ maxLength: 10 }),
    type: fc.constantFrom<CommandEntry['type']>('Screen', 'Action', 'Exercise', 'Routine', 'Saved meal', 'Repertoire tree'),
  }).map((e) => ({ ...e, run: () => undefined }));

const arbModule = (id: string): fc.Arbitrary<TestModule> =>
  fc
    .record({
      name: fc.string({ minLength: 1, maxLength: 12 }),
      segments: fc.uniqueArray(fc.string({ unit: alnum, minLength: 1, maxLength: 6 }), { maxLength: 5 }),
      tabRootAt: fc.option(fc.nat(), { nil: undefined }),
      tables: fc.uniqueArray(fc.tuple(arbShortName, arbSpec), { maxLength: 5, selector: ([short]) => short }),
      entries: fc.option(fc.array(arbEntry(id), { maxLength: 4 }), { nil: undefined }),
    })
    .map(({ name, segments, tabRootAt, tables, entries }) => {
      const rootIndex = tabRootAt === undefined || segments.length === 0 ? -1 : tabRootAt % segments.length;
      const routes: ModuleRoute[] = segments.map((s, i) => ({
        path: `/${id}/${s}`,
        Component: Screen,
        title: s,
        ...(i === rootIndex ? { tabRoot: true } : {}),
      }));
      const mod: TestModule = { id, name, icon: Icon, routes, DashboardCard: Card, tables: Object.fromEntries(tables) };
      if (entries !== undefined) mod.useCommandEntries = () => entries;
      return mod;
    });

const arbModules: fc.Arbitrary<TestModule[]> = fc
  .uniqueArray(arbId, { maxLength: 6 })
  .chain((ids) => (ids.length === 0 ? fc.constant([]) : fc.tuple(...ids.map(arbModule))));

describe('registry derivation', () => {
  it('follows registry order for tabs, routes, cards, command entries and store names', () => {
    // Feature: personal-lab, Property 1: Registry derivation follows registry order
    fc.assert(
      fc.property(arbModules, (mods) => {
        const ids = mods.map((m) => m.id);

        const tabs = deriveTabs(mods);
        expect(tabs.map((t) => t.moduleId)).toEqual(ids);
        expect(tabs.map((t) => t.name)).toEqual(mods.map((m) => m.name));
        expect(tabs.map((t) => t.path)).toEqual(
          mods.map((m) => (m.routes.find((r) => r.tabRoot === true) ?? m.routes[0])?.path ?? null),
        );

        const routes = deriveRoutes(mods);
        expect(routes.map((r) => [r.moduleId, r.path])).toEqual(mods.flatMap((m) => m.routes.map((r) => [m.id, r.path])));
        expect(routes.map(({ moduleId: _moduleId, ...route }) => route)).toEqual(mods.flatMap((m) => m.routes));

        const cards = deriveCards(mods);
        expect(cards.map((c) => c.moduleId)).toEqual(ids);
        expect(cards.every((c, i) => c.DashboardCard === mods[i]!.DashboardCard)).toBe(true);

        const sources = deriveCommandSources(mods);
        expect(sources.map((s) => s.moduleId)).toEqual(mods.filter((m) => m.useCommandEntries !== undefined).map((m) => m.id));
        const entries = sources.flatMap((s) => s.useCommandEntries());
        expect(entries).toEqual(mods.flatMap((m) => m.useCommandEntries?.() ?? []));
        for (const m of mods) {
          if (m.useCommandEntries === undefined) expect(sources.some((s) => s.moduleId === m.id)).toBe(false);
        }

        const stores = buildStores(mods);
        expect(Object.entries(stores)).toEqual([
          ...mods.flatMap((m) => Object.entries(m.tables).map(([short, spec]) => [`${m.id}_${short}`, spec])),
          ...Object.entries(CORE_STORES),
        ]);
      }),
      { numRuns: 300 },
    );
  });
});
