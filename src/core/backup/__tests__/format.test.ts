import { describe, expect, it } from 'vitest';
import {
  Base64DecodeError,
  fromBase64,
  ImageExportError,
  imageFromBackup,
  imageToBackup,
  toBase64,
  type ImageRecord,
} from '../base64';
import { backupFileName } from '../filename';
import { BACKUP_FORMAT, SUPPORTED_SCHEMA_VERSION, toExportedAt } from '../format';
import { BackupMigrationError, migrateEnvelope, migrateModuleEntry } from '../migrations';
import { BackupEnvelope, BackupImageSchema, BackupV1 } from '../schema';

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe('backupFileName', () => {
  it('names an export at 09:05 local time on 7 March 2025 personallab-backup-2025-03-07-0905.json', () => {
    expect(backupFileName(new Date(2025, 2, 7, 9, 5))).toBe('personallab-backup-2025-03-07-0905.json');
  });

  it('uses the 24-hour local time', () => {
    expect(backupFileName(new Date(2025, 11, 31, 23, 59, 59))).toBe('personallab-backup-2025-12-31-2359.json');
    expect(backupFileName(new Date(2026, 0, 1, 0, 0))).toBe('personallab-backup-2026-01-01-0000.json');
  });
});

describe('toExportedAt', () => {
  it('writes ISO 8601 UTC with seconds and a Z suffix', () => {
    expect(toExportedAt(new Date(Date.UTC(2025, 2, 7, 7, 5, 0, 987)))).toBe('2025-03-07T07:05:00Z');
  });
});

describe('base64', () => {
  it('round-trips empty bytes', () => {
    expect(toBase64(new ArrayBuffer(0))).toBe('');
    expect(new Uint8Array(fromBase64(''))).toEqual(new Uint8Array(0));
  });

  it('encodes known values with padding', () => {
    expect(toBase64(bytes(0x4d))).toBe('TQ==');
    expect(toBase64(bytes(0x4d, 0x61))).toBe('TWE=');
    expect(toBase64(bytes(0x4d, 0x61, 0x6e))).toBe('TWFu');
    expect(toBase64(new Uint8Array([0xff, 0xfe, 0x00]))).toBe('//4A');
  });

  it('encodes a typed-array view by its own bytes only', () => {
    const view = new Uint8Array([1, 2, 3, 4, 5]).subarray(1, 3);
    expect(new Uint8Array(fromBase64(toBase64(view)))).toEqual(new Uint8Array([2, 3]));
  });

  it('round-trips more bytes than one encoding chunk', () => {
    const big = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect(new Uint8Array(fromBase64(toBase64(big)))).toEqual(big);
  });

  it('rejects text that is not strict padded base64', () => {
    for (const text of ['TQ', 'T Q==', 'TQ=', '****', 'TWFu\n', 'TQ==TQ==']) {
      expect(() => fromBase64(text)).toThrow(Base64DecodeError);
    }
  });
});

describe('backup images', () => {
  const record: ImageRecord = { id: 'img-1', mime: 'image/jpeg', bytes: bytes(1, 2, 3, 250), width: 640, height: 480 };

  it('converts a stored image to its Backup_File form and back', () => {
    const image = imageToBackup(record);
    expect(image).toEqual({ id: 'img-1', mime: 'image/jpeg', base64: 'AQID+g==', width: 640, height: 480 });
    expect(BackupImageSchema.safeParse(image).success).toBe(true);
    const back = imageFromBackup(image);
    expect(back.id).toBe('img-1');
    expect(new Uint8Array(back.bytes)).toEqual(new Uint8Array([1, 2, 3, 250]));
  });

  it('reports an image without readable bytes as an ImageExportError', () => {
    const broken = { ...record, bytes: undefined } as unknown as ImageRecord;
    expect(() => imageToBackup(broken)).toThrow(ImageExportError);
  });
});

describe('schemas', () => {
  const file = {
    format: BACKUP_FORMAT,
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    appVersion: '1.0.0+3f2a9c1',
    exportedAt: '2025-03-07T07:05:00Z',
    core: { profile: null, settings: [{ key: 'core.backupReminderDays', value: 7 }] },
    modules: [{ id: 'gym', dataVersion: 1, data: {} }],
  };

  it('accepts a Schema_Version 1 file', () => {
    expect(BackupV1.safeParse(file).success).toBe(true);
  });

  it('requires the format identifier and an integer Schema_Version of at least 1', () => {
    expect(BackupEnvelope.safeParse({ format: BACKUP_FORMAT, schemaVersion: 1 }).success).toBe(true);
    expect(BackupEnvelope.safeParse({ format: BACKUP_FORMAT, schemaVersion: 7 }).success).toBe(true);
    expect(BackupEnvelope.safeParse({ format: 'other', schemaVersion: 1 }).success).toBe(false);
    expect(BackupEnvelope.safeParse({ format: BACKUP_FORMAT }).success).toBe(false);
    expect(BackupEnvelope.safeParse({ format: BACKUP_FORMAT, schemaVersion: 0 }).success).toBe(false);
    expect(BackupEnvelope.safeParse({ format: BACKUP_FORMAT, schemaVersion: 1.5 }).success).toBe(false);
    expect(BackupEnvelope.safeParse({ format: BACKUP_FORMAT, schemaVersion: '1' }).success).toBe(false);
  });

  it('rejects an export timestamp without seconds or with milliseconds', () => {
    expect(BackupV1.safeParse({ ...file, exportedAt: '2025-03-07T07:05Z' }).success).toBe(false);
    expect(BackupV1.safeParse({ ...file, exportedAt: '2025-03-07T07:05:00.000Z' }).success).toBe(false);
  });
});

describe('migrateEnvelope', () => {
  it('returns a file at the target version unchanged', () => {
    const file = { schemaVersion: 1, a: 1 };
    expect(migrateEnvelope(file, {}, 1)).toBe(file);
  });

  it('runs every step in order without modifying the input', () => {
    const input = { schemaVersion: 1, items: [1, 2] };
    const out = migrateEnvelope(
      input,
      {
        1: (f) => ({ ...f, items: (f.items as number[]).map((n) => n * 10) }),
        2: (f) => ({ ...f, count: (f.items as number[]).length }),
      },
      3,
    );
    expect(out).toEqual({ schemaVersion: 3, items: [10, 20], count: 2 });
    expect(input).toEqual({ schemaVersion: 1, items: [1, 2] });
  });

  it('throws BackupMigrationError for a missing or throwing step', () => {
    expect(() => migrateEnvelope({ schemaVersion: 1 }, {}, 2)).toThrow(BackupMigrationError);
    expect(() =>
      migrateEnvelope(
        { schemaVersion: 1 },
        {
          1: () => {
            throw new Error('boom');
          },
        },
        2,
      ),
    ).toThrow(BackupMigrationError);
  });
});

describe('migrateModuleEntry', () => {
  const backup = {
    dataVersion: 3,
    migrations: {
      1: (d: unknown) => ({ ...(d as object), v2: true }),
      2: (d: unknown) => ({ ...(d as object), v3: true }),
    },
  };

  it('migrates from the entry version to the current data version', () => {
    expect(migrateModuleEntry('gym', { a: 1 }, 1, backup)).toEqual({ a: 1, v2: true, v3: true });
    expect(migrateModuleEntry('gym', { a: 1 }, 2, backup)).toEqual({ a: 1, v3: true });
  });

  it('leaves data at the current version unchanged', () => {
    const data = { a: 1 };
    expect(migrateModuleEntry('gym', data, 3, backup)).toBe(data);
  });

  it('names the module when a step is missing or throws', () => {
    const error = (() => {
      try {
        migrateModuleEntry('chess', {}, 1, { dataVersion: 2, migrations: {} });
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(BackupMigrationError);
    expect((error as BackupMigrationError).moduleId).toBe('chess');
    expect((error as BackupMigrationError).fromVersion).toBe(1);
  });
});
