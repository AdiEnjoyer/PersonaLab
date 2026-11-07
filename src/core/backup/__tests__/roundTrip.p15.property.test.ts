// Feature: personal-lab, Property 15: Backup round trip
// Also covers Property 16: Import is idempotent
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { arbAppState, clearAppDb, dumpAppState, seedAppState, storedStateOf, withTestApp } from '../../../test/arbitraries/appState';
import { applyImport } from '../apply';
import { buildBackup } from '../export';
import { validateBackupValue } from '../import';

const NOW = new Date(2025, 2, 7, 9, 5);

describe('backup round trip', () => {
  it('export -> clear -> import -> export is identical, and importing twice equals importing once', async () => {
    await withTestApp(async ({ database, modules }) => {
      await fc.assert(
        fc.asyncProperty(arbAppState, async (state) => {
          await clearAppDb(database);
          await seedAppState(database, state);
          const first = await buildBackup(NOW, modules, { database });
          const importFirst = async () => {
            const check = validateBackupValue(JSON.parse(first.text), modules);
            if (!check.ok) throw new Error(check.message);
            await applyImport(check.plan, { database, modules, undo: { push: vi.fn() } });
          };

          await clearAppDb(database);
          await importFirst();
          const second = await buildBackup(NOW, modules, { database });
          expect(second.text).toBe(first.text);
          const once = await dumpAppState(database);
          expect(once).toEqual(storedStateOf(state));

          await importFirst();
          expect(await dumpAppState(database)).toEqual(once);
          expect((await buildBackup(NOW, modules, { database })).text).toBe(first.text);
        }),
        { numRuns: 100 },
      );
    });
  }, 120_000);
});
