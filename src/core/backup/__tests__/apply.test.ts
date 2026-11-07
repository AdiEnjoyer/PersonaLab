import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  arbAppState,
  backupFileOf,
  dumpAppState,
  seedAppState,
  storedModuleOf,
  storedStateOf,
  withTestApp,
  type AppState,
  type TestModuleData,
} from '../../../test/arbitraries/appState';
import { createUndoService } from '../../undo/undoService';
import { applyImport, BackupImportError, IMPORT_UNDO_LABEL } from '../apply';
import { toExportedAt } from '../format';
import { validateBackupValue, type ImportPlan } from '../import';
import type { BackupModule } from '../types';

const EXPORTED_AT = toExportedAt(new Date(2025, 2, 7, 9, 5));
const KEY = 'AIzaKeptAcrossImports';

const [before, incoming] = fc.sample(
  arbAppState.filter((s) => s.profile !== null && s.modules.alpha.items.length > 0 && s.modules.gamma.items.length > 0),
  { numRuns: 2, seed: 7 },
) as [AppState, AppState];

/** A checked plan for `state` with only `ids` present, plus an unregistered `zeta` entry. */
function planOf(state: AppState, ids: readonly string[], modules: readonly BackupModule[]): ImportPlan {
  const file = backupFileOf(state, EXPORTED_AT);
  const parsed = {
    ...file,
    modules: [...file.modules.filter((m) => ids.includes(m.id)), { id: 'zeta', dataVersion: 9, data: 'anything' }],
  };
  const check = validateBackupValue(JSON.parse(JSON.stringify(parsed)), modules);
  if (!check.ok) throw new Error(check.message);
  return check.plan;
}

describe('applyImport', () => {
  it('replaces core data and the present modules, keeps absent modules and the Gemini key, and offers undo', async () => {
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, before, KEY);
      const plan = planOf(incoming, ['alpha', 'beta'], modules);
      const undo = { push: vi.fn() };

      expect(await applyImport(plan, { database, modules, undo })).toEqual({ skipped: ['zeta'] });

      const stored = await dumpAppState(database);
      expect(stored.profile).toEqual(incoming.profile);
      expect(stored.settings).toEqual(incoming.settings);
      expect(stored.modules.alpha).toEqual(storedModuleOf(plan.file.modules[0]!.data as TestModuleData));
      expect(stored.modules.beta).toEqual(storedModuleOf(plan.file.modules[1]!.data as TestModuleData));
      expect(stored.modules.gamma).toEqual(storedStateOf(before).modules.gamma);
      expect(stored.secrets).toEqual([{ key: 'nutrition.geminiKey', value: KEY }]);
      expect(undo.push).toHaveBeenCalledTimes(1);
      expect(undo.push.mock.calls[0]![0]).toMatchObject({ label: IMPORT_UNDO_LABEL });
    });
  });

  it('clears the core Profile when the file has none', async () => {
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, before);
      const plan = planOf({ ...incoming, profile: null, settings: [] }, [], modules);
      await applyImport(plan, { database, modules, undo: { push: vi.fn() } });
      const stored = await dumpAppState(database);
      expect(stored.profile).toBeNull();
      expect(stored.settings).toEqual([]);
      expect(stored.modules).toEqual(storedStateOf(before).modules);
    });
  });

  it('leaves every table unchanged and pushes no undo when the transaction fails', async () => {
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, before, KEY);
      const start = await dumpAppState(database);
      const failing = modules.map((m) =>
        m.id === 'beta' ? { ...m, importData: () => Promise.reject(new DOMException('full', 'QuotaExceededError')) } : m,
      );
      const plan = planOf(incoming, ['alpha', 'beta', 'gamma'], failing);
      const undo = { push: vi.fn() };

      const result = applyImport(plan, { database, modules: failing, undo });
      await expect(result).rejects.toBeInstanceOf(BackupImportError);
      await expect(result).rejects.toMatchObject({
        reason: 'device storage is full',
        message: 'Backup not imported: device storage is full. Your data is unchanged.',
      });
      expect(await dumpAppState(database)).toEqual(start);
      expect(undo.push).not.toHaveBeenCalled();
    });
  });

  it('restores the pre-import state when the Owner taps Undo', async () => {
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, before, KEY);
      const start = await dumpAppState(database);
      const undo = createUndoService();
      await applyImport(planOf(incoming, ['alpha', 'beta', 'gamma'], modules), { database, modules, undo });
      expect(await dumpAppState(database)).not.toEqual(start);
      expect(undo.getState()).toMatchObject({ status: 'shown', label: IMPORT_UNDO_LABEL });

      await undo.undo();
      expect(undo.getState()).toEqual({ status: 'idle' });
      expect(await dumpAppState(database)).toEqual(start);
      undo.dismiss();
    });
  });
});
