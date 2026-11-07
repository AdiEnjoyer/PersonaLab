import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createIdempotent, type CreateResult } from '../idempotent';
import { createDatabase, openDatabase } from '../db';
import { arbText } from '../../../test/arbitraries/core';
import { withTempDb } from '../../../test/helpers/db';

/** Generic idempotent test tables; task 38.3 adds every real module create path. */
const STORES = { alpha: '&id, &idemKey', beta: '&id, &idemKey, group' };
type TableName = keyof typeof STORES;

interface TestRecord {
  id: string;
  idemKey: string;
  name: string;
  group: number;
  note?: string | undefined;
}

interface Variant {
  name: string;
  group: number;
  note: string | undefined;
}

interface Op {
  table: TableName;
  idemKey: string;
  /** One variant per application (1–5); repeats may carry different field values. */
  variants: Variant[];
  /** Whether the repeats are placed directly after each other. */
  adjacent: boolean;
}

const arbVariant: fc.Arbitrary<Variant> = fc.record({
  name: arbText(0, 10),
  group: fc.integer({ min: 0, max: 3 }),
  note: fc.option(arbText(0, 6), { nil: undefined }),
});

const arbOps: fc.Arbitrary<Op[]> = fc.uniqueArray(
  fc.record({
    table: fc.constantFrom<TableName>('alpha', 'beta'),
    idemKey: fc.oneof(fc.uuid(), arbText(1, 6)),
    variants: fc.array(arbVariant, { minLength: 1, maxLength: 5 }),
    adjacent: fc.boolean(),
  }),
  { minLength: 1, maxLength: 12, selector: (op) => `${op.table}\u0000${op.idemKey}` },
);

interface Application {
  op: number;
  variant: number;
}

/**
 * A schedule of every application: adjacent ops form one block, the others one block per application;
 * the blocks are shuffled, and the resulting sequence is cut into batches that run concurrently.
 */
const arbScenario = arbOps.chain((ops) => {
  const blocks: Application[][] = ops.flatMap((op, o) =>
    op.adjacent ? [op.variants.map((_, v) => ({ op: o, variant: v }))] : op.variants.map((_, v) => [{ op: o, variant: v }]),
  );
  return fc
    .tuple(
      fc.shuffledSubarray(blocks, { minLength: blocks.length, maxLength: blocks.length }),
      fc.array(fc.boolean(), { minLength: 60, maxLength: 60 }),
    )
    .map(([shuffled, cuts]) => {
      const sequence = shuffled.flat();
      const batches: Application[][] = [];
      sequence.forEach((app, i) => {
        if (i === 0 || cuts[i % cuts.length]!) batches.push([app]);
        else batches[batches.length - 1]!.push(app);
      });
      return { ops, batches };
    });
});

const recordOf = (ops: Op[], app: Application): TestRecord => {
  const op = ops[app.op]!;
  const v = op.variants[app.variant]!;
  return { id: `${app.op}:${app.variant}`, idemKey: op.idemKey, name: v.name, group: v.group, note: v.note };
};

const withoutUndefined = (r: TestRecord): TestRecord =>
  Object.fromEntries(Object.entries(r).filter(([, value]) => value !== undefined)) as unknown as TestRecord;

const byId = (rows: TestRecord[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

describe('createIdempotent', () => {
  it('applying each create 1–5 times equals applying it once, and every repeat returns the first record', async () => {
    // Feature: personal-lab, Property 20: Create operations are idempotent
    await fc.assert(
      fc.asyncProperty(arbScenario, async ({ ops, batches }) => {
        await withTempDb(
          (name) => createDatabase(name, { initialStores: STORES, migrations: [], currentStores: STORES }),
          async (database) => {
            expect(await openDatabase(database)).toEqual({ ok: true });

            const results = new Map<string, CreateResult<TestRecord>>();
            const firstApplication = new Map<number, Application>();
            for (const batch of batches) {
              const settled = await Promise.all(
                batch.map((app) => {
                  if (!firstApplication.has(app.op)) firstApplication.set(app.op, app);
                  return createIdempotent(ops[app.op]!.table, recordOf(ops, app), database).then((r) => [app, r] as const);
                }),
              );
              for (const [app, r] of settled) results.set(`${app.op}:${app.variant}`, r);
            }

            // Final contents equal applying each operation once (its first application).
            for (const table of Object.keys(STORES) as TableName[]) {
              const expected = ops
                .map((op, o) => ({ op, first: firstApplication.get(o)! }))
                .filter(({ op }) => op.table === table)
                .map(({ first }) => withoutUndefined(recordOf(ops, first)));
              expect(byId(await database.table<TestRecord>(table).toArray())).toStrictEqual(byId(expected));
            }

            // Every application returns the record of the first one; only the first reports `created`.
            ops.forEach((op, o) => {
              const first = firstApplication.get(o)!;
              const firstRecord = withoutUndefined(recordOf(ops, first));
              op.variants.forEach((_, v) => {
                const result = results.get(`${o}:${v}`)!;
                expect(result.record).toEqual(firstRecord);
                expect(result.created).toBe(v === first.variant);
              });
            });
          },
        );
      }),
      { numRuns: 100 },
    );
  }, 180_000);
});
