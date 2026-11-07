import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateRegistry } from '../validate';
import type { ModuleRoute } from '../types';
import { registryProblemsOracle } from '../../../test/oracles/registry';

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');

const letter = fc.constantFrom(...LOWER);
const alnum = fc.constantFrom(...LOWER, ...DIGITS);
const alnumString = (minLength: number, maxLength: number) => fc.string({ unit: alnum, minLength, maxLength });

/** Valid ids: a letter followed by 0–19 lowercase letters or digits. */
const arbValidId = fc.tuple(letter, alnumString(0, 19)).map(([first, rest]) => first + rest);

/** Inserts `char` into `id` at a position chosen by `at`. */
const insertAt = (id: string, char: string, at: number) => {
  const i = at % (id.length + 1);
  return id.slice(0, i) + char + id.slice(i);
};

/** Invalid ids: uppercase, leading digit, length 0 or > 20, symbols. */
const arbInvalidId = fc.oneof(
  // Uppercase letter anywhere
  fc.tuple(arbValidId, fc.constantFrom(...UPPER), fc.nat()).map(([id, c, at]) => insertAt(id, c, at)),
  // Leading digit
  fc.tuple(fc.constantFrom(...DIGITS), alnumString(0, 19)).map(([d, rest]) => d + rest),
  // Empty
  fc.constant(''),
  // Longer than 20 characters
  fc.tuple(letter, alnumString(20, 29)).map(([first, rest]) => first + rest),
  // Symbols, spaces, accents, Hebrew and emoji
  fc
    .tuple(arbValidId, fc.constantFrom('-', '_', ' ', '.', '/', 'é', 'א', '😀', '\n'), fc.nat())
    .map(([id, c, at]) => insertAt(id, c, at)),
  // Fixed cases from the requirements' examples
  fc.constantFrom('Gym', '1gym', 'a'.repeat(21)),
);

/** A small shared pool so the same id (valid or not) appears in several modules. */
const arbPooledId = fc.constantFrom('gym', 'nutrition', 'chess', 'sleep', 'a', 'Gym', '1gym');

const arbId = fc.oneof(arbPooledId, arbValidId, arbInvalidId);

/** Paths from a small pool (including the core paths) collide often; generated paths rarely do. */
const arbPath = fc.oneof(
  fc.constantFrom('/', '/settings', '/gym', '/gym/library', '/nutrition', '/chess', '/shared'),
  alnumString(1, 8).map((s) => `/${s}`),
);

const Screen = () => null;
const arbRoute: fc.Arbitrary<ModuleRoute> = fc
  .tuple(arbPath, fc.boolean())
  .map(([path, tabRoot]) => ({ path, Component: Screen, title: path, tabRoot }));

const arbModules = fc.array(fc.record({ id: arbId, routes: fc.array(arbRoute, { maxLength: 5 }) }), { maxLength: 8 });

describe('validateRegistry', () => {
  it('reports exactly the invalid ids, duplicated ids and duplicated route paths', () => {
    // Feature: personal-lab, Property 3: Registry validator reports exactly the problems
    fc.assert(
      fc.property(arbModules, (mods) => {
        expect(validateRegistry(mods)).toEqual(registryProblemsOracle(mods, ['/', '/settings']));
      }),
      { numRuns: 500 },
    );
  });
});
