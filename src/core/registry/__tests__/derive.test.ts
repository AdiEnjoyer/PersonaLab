import { describe, expect, it } from 'vitest';
import { deriveCards, deriveCommandSources, deriveRoutes, deriveTabs } from '../derive';
import { getCapability } from '../capabilities';
import type { CommandEntry, ModuleRoute } from '../types';

const Icon = () => null;
const Card = () => null;
const Screen = () => null;
const route = (path: string, tabRoot?: boolean): ModuleRoute =>
  tabRoot === undefined ? { path, Component: Screen, title: path } : { path, Component: Screen, title: path, tabRoot };
const entry = (id: string): CommandEntry => ({ id, name: id, type: 'Screen', run: () => undefined });

const gymCommands = () => [entry('gym:start')];
const chessCommands = () => [entry('chess:board'), entry('chess:drill')];

const mods = [
  {
    id: 'gym',
    name: 'Gym',
    icon: Icon,
    DashboardCard: Card,
    routes: [route('/gym/library'), route('/gym', true), route('/gym/session')],
    useCommandEntries: gymCommands,
  },
  { id: 'nutrition', name: 'Nutrition', icon: Icon, DashboardCard: Card, routes: [route('/nutrition', true)] },
  {
    id: 'chess',
    name: 'Chess',
    icon: Icon,
    DashboardCard: Card,
    routes: [route('/chess', true), route('/chess/board')],
    useCommandEntries: chessCommands,
  },
];

describe('deriveTabs', () => {
  it('builds one tab per module in registry order, targeting the tab-root route', () => {
    expect(deriveTabs(mods)).toEqual([
      { moduleId: 'gym', name: 'Gym', icon: Icon, path: '/gym' },
      { moduleId: 'nutrition', name: 'Nutrition', icon: Icon, path: '/nutrition' },
      { moduleId: 'chess', name: 'Chess', icon: Icon, path: '/chess' },
    ]);
  });

  it('falls back to the first route, then to null', () => {
    expect(deriveTabs([{ id: 'a', name: 'A', icon: Icon, routes: [route('/a/x'), route('/a/y')] }])[0]?.path).toBe('/a/x');
    expect(deriveTabs([{ id: 'b', name: 'B', icon: Icon, routes: [] }])[0]?.path).toBeNull();
  });
});

describe('deriveRoutes', () => {
  it('lists every route, modules in registry order and routes in declaration order', () => {
    expect(deriveRoutes(mods).map((r) => [r.moduleId, r.path])).toEqual([
      ['gym', '/gym/library'],
      ['gym', '/gym'],
      ['gym', '/gym/session'],
      ['nutrition', '/nutrition'],
      ['chess', '/chess'],
      ['chess', '/chess/board'],
    ]);
  });

  it('keeps the route fields', () => {
    const first = deriveRoutes(mods)[1];
    expect(first).toEqual({ path: '/gym', Component: Screen, title: '/gym', tabRoot: true, moduleId: 'gym' });
  });
});

describe('deriveCards', () => {
  it('builds one card per module in registry order', () => {
    expect(deriveCards(mods)).toEqual([
      { moduleId: 'gym', name: 'Gym', DashboardCard: Card },
      { moduleId: 'nutrition', name: 'Nutrition', DashboardCard: Card },
      { moduleId: 'chess', name: 'Chess', DashboardCard: Card },
    ]);
  });
});

describe('deriveCommandSources', () => {
  it('keeps registry order and skips modules without command entries', () => {
    expect(deriveCommandSources(mods)).toEqual([
      { moduleId: 'gym', useCommandEntries: gymCommands },
      { moduleId: 'chess', useCommandEntries: chessCommands },
    ]);
    expect(deriveCommandSources([{ id: 'nutrition' }])).toEqual([]);
  });
});

describe('getCapability', () => {
  it('returns the first provider in list order, or undefined', async () => {
    const first = { listFinishedSessions: async () => [{ startedAt: 1, finishedAt: 2 }] };
    const second = { listFinishedSessions: async () => [] };
    expect(getCapability('trainingLog', [{}, { provides: { trainingLog: first } }, { provides: { trainingLog: second } }])).toBe(
      first,
    );
    expect(getCapability('trainingLog', [{}, { provides: {} }])).toBeUndefined();
    expect(getCapability('trainingLog', [])).toBeUndefined();
    await expect(first.listFinishedSessions()).resolves.toEqual([{ startedAt: 1, finishedAt: 2 }]);
  });
});
