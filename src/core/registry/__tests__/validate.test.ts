import { describe, expect, it } from 'vitest';
import { isValidModuleId, validateRegistry } from '../validate';
import type { ModuleRoute } from '../types';

const Screen = () => null;
const route = (path: string, tabRoot = false): ModuleRoute => ({ path, Component: Screen, title: path, tabRoot });
const mod = (id: string, ...paths: string[]) => ({ id, routes: paths.map((p, i) => route(p, i === 0)) });

describe('validateRegistry', () => {
  it('accepts a valid list', () => {
    expect(
      validateRegistry([mod('gym', '/gym', '/gym/library'), mod('nutrition', '/nutrition'), mod('chess', '/chess')]),
    ).toEqual([]);
  });

  it('accepts an empty list and a module with no routes', () => {
    expect(validateRegistry([])).toEqual([]);
    expect(validateRegistry([mod('sleep')])).toEqual([]);
  });

  it('reports an uppercase id', () => {
    expect(validateRegistry([mod('Gym', '/gym')])).toEqual([{ kind: 'invalid-id', id: 'Gym' }]);
  });

  it('reports an id that starts with a digit', () => {
    expect(validateRegistry([mod('1gym', '/gym')])).toEqual([{ kind: 'invalid-id', id: '1gym' }]);
  });

  it('accepts a 20-character id and reports a 21-character id', () => {
    const twenty = 'a'.repeat(20);
    const twentyOne = 'a'.repeat(21);
    expect(validateRegistry([mod(twenty, '/a')])).toEqual([]);
    expect(validateRegistry([mod(twentyOne, '/a')])).toEqual([{ kind: 'invalid-id', id: twentyOne }]);
  });

  it('reports an empty id and ids with symbols', () => {
    expect(validateRegistry([mod(''), mod('gym-log'), mod('gym_log'), mod('gým')])).toEqual([
      { kind: 'invalid-id', id: '' },
      { kind: 'invalid-id', id: 'gym-log' },
      { kind: 'invalid-id', id: 'gym_log' },
      { kind: 'invalid-id', id: 'gým' },
    ]);
  });

  it('reports a duplicate id once', () => {
    expect(validateRegistry([mod('gym', '/gym'), mod('chess', '/chess'), mod('gym', '/gym2'), mod('gym', '/gym3')])).toEqual(
      [{ kind: 'duplicate-id', id: 'gym' }],
    );
  });

  it('compares ids case-sensitively', () => {
    expect(validateRegistry([mod('gym', '/a'), mod('Gym', '/b')])).toEqual([{ kind: 'invalid-id', id: 'Gym' }]);
  });

  it('reports a duplicate route with every declaring id', () => {
    expect(validateRegistry([mod('gym', '/gym', '/shared'), mod('nutrition', '/shared'), mod('chess', '/shared')])).toEqual([
      { kind: 'duplicate-route', path: '/shared', declaredBy: ['gym', 'nutrition', 'chess'] },
    ]);
  });

  it('reports a route declared twice by one module', () => {
    expect(validateRegistry([mod('gym', '/gym', '/gym')])).toEqual([
      { kind: 'duplicate-route', path: '/gym', declaredBy: ['gym'] },
    ]);
  });

  it('includes the core paths under the pseudo-id core', () => {
    expect(validateRegistry([mod('gym', '/gym', '/settings'), mod('chess', '/')])).toEqual([
      { kind: 'duplicate-route', path: '/', declaredBy: ['core', 'chess'] },
      { kind: 'duplicate-route', path: '/settings', declaredBy: ['core', 'gym'] },
    ]);
  });

  it('reports every kind of problem together, invalid ids first', () => {
    expect(validateRegistry([mod('gym', '/gym'), mod('Bad', '/x'), mod('gym', '/x')])).toEqual([
      { kind: 'invalid-id', id: 'Bad' },
      { kind: 'duplicate-id', id: 'gym' },
      { kind: 'duplicate-route', path: '/x', declaredBy: ['Bad', 'gym'] },
    ]);
  });
});

describe('isValidModuleId', () => {
  it('follows the R2.5 pattern', () => {
    for (const id of ['a', 'gym', 'nutrition', 'chess', 'sleep2', 'a1b2c3']) expect(isValidModuleId(id)).toBe(true);
    for (const id of ['', 'A', '1', '9lives', 'gym ', ' gym', 'gym\n', 'g.y']) expect(isValidModuleId(id)).toBe(false);
  });
});
