// Feature: personal-lab, Property 2: Export calls every module once, in order
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import { arbEpoch } from '../../../test/arbitraries/core';
import { withTestApp } from '../../../test/arbitraries/appState';
import { buildBackup } from '../export';
import type { BackupModule } from '../types';

/** Generated module ids in the registry id format (R2.5). */
const arbModuleIds = fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/), { minLength: 0, maxLength: 8 });

/** What each fake module's `exportData` resolves to: arbitrary JSON plus a per-module marker. */
const arbExport = fc.record({ payload: fc.jsonValue(), resolveAfterTicks: fc.integer({ min: 0, max: 3 }) });

describe('buildBackup', () => {
  it('calls each exportData exactly once in registry order and writes each result into that module entry', async () => {
    await withTestApp(async ({ database }) => {
      await fc.assert(
        fc.asyncProperty(
          arbModuleIds.chain((ids) => fc.tuple(fc.constant(ids), fc.array(arbExport, { minLength: ids.length, maxLength: ids.length }))),
          arbEpoch,
          async ([ids, exports], at) => {
            const calls: string[] = [];
            const results = ids.map((id, i) => ({ module: id, index: i, payload: exports[i]!.payload }));
            const spies = ids.map((id, i) =>
              vi.fn(async () => {
                calls.push(id);
                for (let t = 0; t < exports[i]!.resolveAfterTicks; t++) await Promise.resolve();
                return results[i];
              }),
            );
            const modules: BackupModule[] = ids.map((id, i) => ({
              id,
              name: id,
              tables: {},
              exportData: spies[i]!,
              importData: () => Promise.resolve(),
              backup: { dataVersion: (i % 3) + 1, schema: z.unknown(), migrations: {}, sections: () => [] },
            }));

            const { file, text } = await buildBackup(new Date(at), modules, { database });

            expect(calls).toEqual(ids);
            for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
            expect(file.modules.map((m) => m.id)).toEqual(ids);
            file.modules.forEach((entry, i) => {
              expect(entry.data).toBe(results[i]);
              expect(entry.dataVersion).toBe(modules[i]!.backup.dataVersion);
            });
            expect((JSON.parse(text) as { modules: unknown[] }).modules).toEqual(JSON.parse(JSON.stringify(file.modules)));
          },
        ),
        { numRuns: 100 },
      );
    });
  }, 60_000);
});
