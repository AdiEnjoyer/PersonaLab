import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type Dexie from 'dexie';
import { CORE_TABLES, META_KEYS } from '../../db/tables';
import { MODULES } from '../../registry/modules';
import { getSecret, SECRET_KEYS } from '../../settings/secrets';
import { withFreshDb } from '../../../test/helpers/db';
import {
  arbAppState,
  backupFileOf,
  seedAppState,
  TEST_APP_VERSION,
  TEST_MODULES,
  withTestApp,
  type AppState,
} from '../../../test/arbitraries/appState';
import { ImageExportError } from '../base64';
import { buildBackup, exportBackup } from '../export';
import { BACKUP_FORMAT, toExportedAt } from '../format';
import { shareOrDownload } from '../share';
import type { BackupModule } from '../types';

const NOW = new Date(2025, 2, 7, 9, 5, 30);
const FILE_NAME = 'personallab-backup-2025-03-07-0905.json';

const sample: AppState = fc.sample(arbAppState.filter((s) => s.profile !== null && s.modules.alpha.images.length > 0), {
  numRuns: 1,
  seed: 42,
})[0]!;

async function lastBackupAt(database: Dexie): Promise<unknown> {
  return (await database.table(CORE_TABLES.meta).get(META_KEYS.lastBackupAt))?.value;
}

type NavigatorShare = Pick<Navigator, 'share' | 'canShare'>;

function mockShare(impl: { canShare?: NavigatorShare['canShare']; share?: NavigatorShare['share'] }) {
  const canShare = vi.fn(impl.canShare ?? (() => true));
  const share = vi.fn(impl.share ?? (() => Promise.resolve()));
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true, writable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  return { canShare, share };
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clicked: HTMLAnchorElement[];

beforeEach(() => {
  clicked = [];
  createObjectURL = vi.fn(() => 'blob:backup');
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as Partial<NavigatorShare>).share;
  delete (navigator as Partial<NavigatorShare>).canShare;
});

describe('buildBackup', () => {
  it('writes the envelope, core data and one entry per module in registry order', async () => {
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, sample);
      const { file, text } = await buildBackup(NOW, modules, { database, appVersion: TEST_APP_VERSION });
      expect(file.format).toBe(BACKUP_FORMAT);
      expect(file.schemaVersion).toBe(1);
      expect(file.exportedAt).toBe(toExportedAt(NOW));
      expect(file.modules.map((m) => [m.id, m.dataVersion])).toEqual([
        ['alpha', 1],
        ['beta', 2],
        ['gamma', 1],
      ]);
      expect(text).toBe(JSON.stringify(backupFileOf(sample, toExportedAt(NOW))));
    });
  });

  it('gives every registered App module an entry, even with no records (R6.1)', async () => {
    await withFreshDb(async (database) => {
      const { file } = await buildBackup(NOW, MODULES, { database });
      expect(file.core).toEqual({ profile: null, settings: [] });
      expect(file.modules).toEqual(MODULES.map((m) => ({ id: m.id, dataVersion: m.backup.dataVersion, data: {} })));
    });
  });

  it('never exports the Gemini key and keeps it stored', async () => {
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, sample, 'AIzaSecretKey123');
      const { text } = await buildBackup(NOW, modules, { database });
      expect(text).not.toContain('AIzaSecretKey123');
      expect(await getSecret(SECRET_KEYS.geminiKey, database)).toBe('AIzaSecretKey123');
    });
  });

  it('stops when the file text would contain the Gemini key', async () => {
    await withTestApp(async ({ database, modules }) => {
      const state = structuredClone(sample);
      state.modules.gamma.items.push({ id: 'x', idemKey: 'y', name: 'my key is AIzaLeaked', amount: 1, position: 0, tags: [] });
      await seedAppState(database, state, 'AIzaLeaked');
      await expect(buildBackup(NOW, modules, { database })).rejects.toMatchObject({ part: 'Gemini key' });
    });
  });

  it('names a failed module export by its id and an image read failure as images', async () => {
    await withTestApp(async ({ database, modules }) => {
      const failing: BackupModule[] = [modules[0]!, { ...modules[1]!, exportData: () => Promise.reject(new Error('boom')) }];
      await expect(buildBackup(NOW, failing, { database })).rejects.toMatchObject({
        part: 'beta',
        message: 'Backup not created: beta could not be read.',
      });
      const images: BackupModule[] = [{ ...modules[0]!, exportData: () => Promise.reject(new ImageExportError('img')) }];
      await expect(buildBackup(NOW, images, { database })).rejects.toMatchObject({ part: 'images' });
    });
  });

  it('names core data when the core tables cannot be read', async () => {
    await withTestApp(async ({ database, modules }) => {
      vi.spyOn(database, 'transaction').mockRejectedValueOnce(new Error('read failed'));
      await expect(buildBackup(NOW, modules, { database })).rejects.toMatchObject({ part: 'core data' });
    });
  });

  it('rejects its own file when a stored record is invalid, naming the section and field (R8.7)', async () => {
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, { ...sample, settings: [{ key: 'alpha.level', value: 99 }] });
      await expect(buildBackup(NOW, modules, { database })).rejects.toMatchObject({
        part: 'core data',
        message: `Backup not created: Invalid record in core data, record ${sample.profile === null ? 1 : 2}: value.`,
      });
    });
  });
});

describe('exportBackup', () => {
  it('shares the file and records the export timestamp as the last backup time', async () => {
    const { share, canShare } = mockShare({});
    await withTestApp(async ({ database, modules }) => {
      await seedAppState(database, sample);
      const outcome = await exportBackup({ database, modules, now: () => NOW });
      expect(outcome).toEqual({ kind: 'shared', exportedAt: toExportedAt(NOW), lastBackupRecorded: true });
      expect(canShare).toHaveBeenCalledTimes(1);
      const shared = share.mock.calls[0]![0]!.files![0]!;
      expect(shared.name).toBe(FILE_NAME);
      expect(shared.type).toBe('application/json');
      expect(JSON.parse(await shared.text()).exportedAt).toBe(toExportedAt(NOW));
      expect(await lastBackupAt(database)).toBe(Date.parse(toExportedAt(NOW)));
      expect(clicked).toEqual([]);
    });
  });

  it('leaves the last backup time unchanged when the share sheet is dismissed', async () => {
    mockShare({ share: () => Promise.reject(new DOMException('cancelled', 'AbortError')) });
    await withTestApp(async ({ database, modules }) => {
      expect(await exportBackup({ database, modules, now: () => NOW })).toEqual({ kind: 'dismissed' });
      expect(await lastBackupAt(database)).toBeUndefined();
      expect(clicked).toEqual([]);
    });
  });

  it('falls back to a download when the share sheet fails for another reason', async () => {
    mockShare({ share: () => Promise.reject(new DOMException('not allowed', 'NotAllowedError')) });
    await withTestApp(async ({ database, modules }) => {
      const outcome = await exportBackup({ database, modules, now: () => NOW });
      expect(outcome).toMatchObject({ kind: 'downloaded', lastBackupRecorded: true });
      expect(clicked).toHaveLength(1);
      expect(clicked[0]!.download).toBe(FILE_NAME);
      expect(clicked[0]!.href).toBe('blob:backup');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(await lastBackupAt(database)).toBe(Date.parse(toExportedAt(NOW)));
    });
  });

  it('downloads when the Web Share API cannot share files', async () => {
    mockShare({ canShare: () => false });
    await withTestApp(async ({ database, modules }) => {
      expect(await exportBackup({ database, modules, now: () => NOW })).toMatchObject({ kind: 'downloaded' });
      expect(clicked).toHaveLength(1);
    });
  });

  it('shares or downloads nothing and keeps the last backup time when a module export fails', async () => {
    const { share } = mockShare({});
    await withTestApp(async ({ database, modules }) => {
      await database.table(CORE_TABLES.meta).put({ key: META_KEYS.lastBackupAt, value: 1234 });
      const failing = modules.map((m) => (m.id === 'gamma' ? { ...m, exportData: () => Promise.reject(new Error('x')) } : m));
      const outcome = await exportBackup({ database, modules: failing, now: () => NOW });
      expect(outcome).toEqual({ kind: 'failed', part: 'gamma', message: 'Backup not created: gamma could not be read.' });
      expect(share).not.toHaveBeenCalled();
      expect(clicked).toEqual([]);
      expect(await lastBackupAt(database)).toBe(1234);
    });
  });
});

describe('shareOrDownload', () => {
  it('downloads when the Web Share API is missing', async () => {
    expect(await shareOrDownload(new File(['{}'], 'b.json'))).toBe('downloaded');
    expect(clicked[0]!.download).toBe('b.json');
  });

  it('treats a throwing canShare as unable to share', async () => {
    mockShare({
      canShare: () => {
        throw new TypeError('bad');
      },
    });
    expect(await shareOrDownload(new File(['{}'], 'b.json'))).toBe('downloaded');
  });
});

describe('the test registry', () => {
  it('declares three modules with tables and backup schemas', () => {
    expect(TEST_MODULES.map((m) => m.id)).toEqual(['alpha', 'beta', 'gamma']);
  });
});
