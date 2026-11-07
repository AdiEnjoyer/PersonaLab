import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import Dexie from 'dexie';
import { createDatabase, openDatabase, type SchemaConfig } from '../db';
import type { DbMigration } from '../versions';
import { arbText } from '../../../test/arbitraries/core';
import { inspectDatabase, uniqueDbName } from '../../../test/helpers/db';

interface ItemV1 {
  id: string;
  kind: 'keep' | 'drop' | 'other';
  qty: number;
  label: string;
}
interface Note {
  id: string;
  text: string;
}

const V1_STORES = { items: '&id, kind', notes: '&id' };
const V3_STORES = { items: '&id, kind, qty', notes: '&id', archive: '&id' };

const arbItem: fc.Arbitrary<ItemV1> = fc.record({
  id: arbText(0, 6),
  kind: fc.constantFrom('keep', 'drop', 'other'),
  qty: fc.integer({ min: -1_000_000, max: 1_000_000 }),
  label: arbText(0, 12),
});
const arbNote: fc.Arbitrary<Note> = fc.record({ id: arbText(0, 6), text: arbText(0, 20) });

const arbState = fc.record({
  items: fc.uniqueArray(arbItem, { maxLength: 25, selector: (i) => i.id }),
  notes: fc.uniqueArray(arbNote, { maxLength: 8, selector: (n) => n.id }),
});

/** v1 → v2: field transform `qty → 3·qty + 1`, plus `rev: 2`. */
const toV2: DbMigration = {
  version: 2,
  stores: { items: '&id, kind, qty' },
  upgrade: async (tx) => {
    await tx
      .table('items')
      .toCollection()
      .modify((item: { qty: number; rev?: number }) => {
        item.qty = item.qty * 3 + 1;
        item.rev = 2;
      });
  },
  moduleDataVersions: { test: 2 },
};

/** v2 → v3: adds a table and deletes the items of kind "drop". */
const toV3 = (fail: 'no' | 'before-delete' | 'after-delete'): DbMigration => ({
  version: 3,
  stores: { archive: '&id' },
  deletes: ['items whose kind is "drop"'],
  upgrade: async (tx) => {
    if (fail === 'before-delete') throw new Error('v3 failed');
    await tx.table('items').where('kind').equals('drop').delete();
    if (fail === 'after-delete') throw new Error('v3 failed');
  },
  moduleDataVersions: { test: 3 },
});

const chain = (fail: 'no' | 'before-delete' | 'after-delete'): SchemaConfig => ({
  initialStores: V1_STORES,
  migrations: [toV2, toV3(fail)],
  currentStores: V3_STORES,
});

const byKey = <T extends { id: string }>(rows: T[]): T[] => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

async function seedV1(name: string, state: { items: ItemV1[]; notes: Note[] }): Promise<void> {
  const seed = new Dexie(name);
  seed.version(1).stores(V1_STORES);
  await seed.table('items').bulkAdd(state.items);
  await seed.table('notes').bulkAdd(state.notes);
  seed.close();
}

async function openWith(name: string, config: SchemaConfig) {
  const database = createDatabase(name, config);
  try {
    return await openDatabase(database);
  } finally {
    database.close();
  }
}

describe('database migrations', () => {
  it('preserve every non-deleted record with exactly the transformed values, and roll back completely on failure', async () => {
    // Feature: personal-lab, Property 4: Database migrations preserve records
    await fc.assert(
      fc.asyncProperty(arbState, fc.constantFrom<'before-delete' | 'after-delete'>('before-delete', 'after-delete'), async (state, failAt) => {
        // Successful chain v1 → v2 → v3.
        const okName = uniqueDbName('p4');
        try {
          await seedV1(okName, state);
          expect(await openWith(okName, chain('no'))).toEqual({ ok: true });
          const after = await inspectDatabase(okName);
          expect(after.version).toBe(3);
          expect(after.tables['items']).toEqual(
            byKey(state.items.filter((i) => i.kind !== 'drop').map((i) => ({ ...i, qty: i.qty * 3 + 1, rev: 2 }))),
          );
          expect(after.tables['notes']).toEqual(byKey(state.notes));
          expect(after.tables['archive']).toEqual([]);
        } finally {
          await Dexie.delete(okName);
        }

        // A chain whose v3 step throws leaves version 1 with every record unchanged.
        const failName = uniqueDbName('p4');
        try {
          await seedV1(failName, state);
          const before = await inspectDatabase(failName);
          const result = await openWith(failName, chain(failAt));
          expect(result).toMatchObject({ ok: false, reason: 'migration-failed', storedVersion: 1 });
          const after = await inspectDatabase(failName);
          expect(after).toEqual(before);
          expect(after.version).toBe(1);
          expect(after.tables).toEqual({ items: byKey(state.items), notes: byKey(state.notes) });
        } finally {
          await Dexie.delete(failName);
        }
      }),
      { numRuns: 100 },
    );
  }, 180_000);
});
