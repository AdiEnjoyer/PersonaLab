import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createIdempotent, MissingIdempotencyKeyError } from '../idempotent';
import { createDatabase, openDatabase } from '../db';
import { arbText } from '../../../test/arbitraries/core';
import { withTempDb } from '../../../test/helpers/db';

const STORES = { alpha: '&id, &idemKey' };

interface TestRecord {
  id: string;
  idemKey: string;
  name: string;
}

const ABSENT = Symbol('absent');

/** A missing, empty or non-string Idempotency_Key. */
const arbBadKey: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(ABSENT),
  fc.constant(undefined),
  fc.constant(''),
  fc.constant(null),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.bigInt(),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 3 }), fc.string({ maxLength: 3 }), { maxKeys: 3 }),
  fc.constant(new String('boxed')),
  fc.constant(Symbol('key')),
);

const arbStored = fc.uniqueArray(
  fc.record({ id: arbText(1, 6), idemKey: fc.uuid(), name: arbText(0, 10) }),
  { maxLength: 15, selector: (r) => r.id },
);

const arbAttempt = fc.record({ id: arbText(1, 6), name: arbText(0, 10), key: arbBadKey });

describe('createIdempotent without a key', () => {
  it('rejects with MissingIdempotencyKeyError and leaves the table unchanged', async () => {
    // Feature: personal-lab, Property 21: Creates without a key are rejected
    await fc.assert(
      fc.asyncProperty(arbStored, fc.array(arbAttempt, { minLength: 1, maxLength: 5 }), async (stored, attempts) => {
        await withTempDb(
          (name) => createDatabase(name, { initialStores: STORES, migrations: [], currentStores: STORES }),
          async (database) => {
            expect(await openDatabase(database)).toEqual({ ok: true });
            await database.table('alpha').bulkAdd(stored);
            const before = await database.table('alpha').toArray();

            for (const { id, name, key } of attempts) {
              const record: Record<string, unknown> = { id, name };
              if (key !== ABSENT) record['idemKey'] = key;
              const attempt = createIdempotent('alpha', record as unknown as TestRecord, database);
              await expect(attempt).rejects.toBeInstanceOf(MissingIdempotencyKeyError);
            }

            expect(await database.table('alpha').toArray()).toStrictEqual(before);
          },
        );
      }),
      { numRuns: 100 },
    );
  }, 180_000);
});
