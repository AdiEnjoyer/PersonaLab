// Feature: personal-lab, Property 8: Image base64 round trip
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arbImageBytes } from '../../../test/arbitraries/core';
import { clearAppDb, TEST_APP_VERSION, withTestApp, type TestModuleData } from '../../../test/arbitraries/appState';
import { moduleTableName } from '../../db/tables';
import { fromBase64, toBase64, type ImageRecord } from '../base64';
import { buildBackup } from '../export';
import type { BackupV1 } from '../schema';

const NOW = new Date(2025, 2, 7, 9, 5);

const arbMime = fc.constantFrom('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/svg+xml');

/** The bytes, optionally seen through a typed-array view at an offset inside a larger buffer. */
const arbView = fc.record({ bytes: arbImageBytes, before: fc.integer({ min: 0, max: 7 }), after: fc.integer({ min: 0, max: 7 }) });

describe('base64 images', () => {
  it('fromBase64(toBase64(bytes)) returns the bytes, and an exported stored image decodes to its bytes and MIME type', async () => {
    await withTestApp(async ({ database, modules }) => {
      await fc.assert(
        fc.asyncProperty(arbView, arbMime, fc.constantFrom('alpha', 'beta', 'gamma'), fc.uuid(), async ({ bytes, before, after }, mime, moduleId, id) => {
          // Pure round trip, for a whole buffer and for a view into a larger one.
          const buffer = new Uint8Array(before + bytes.length + after);
          buffer.set(bytes, before);
          const view = buffer.subarray(before, before + bytes.length);
          expect(new Uint8Array(fromBase64(toBase64(bytes.slice().buffer)))).toEqual(bytes);
          expect(new Uint8Array(fromBase64(toBase64(view)))).toEqual(bytes);

          // A stored image inside a Backup_File.
          await clearAppDb(database);
          const record: ImageRecord = { id, mime, bytes: bytes.slice().buffer, width: 1, height: 1 };
          await database.table(moduleTableName(moduleId, 'images')).add(record);
          const { text } = await buildBackup(NOW, modules, { database, appVersion: TEST_APP_VERSION });
          const file = JSON.parse(text) as BackupV1;
          const images = file.modules.flatMap((m) => (m.data as TestModuleData).images.map((image) => ({ moduleId: m.id, image })));
          expect(images).toHaveLength(1);
          expect(images[0]!.moduleId).toBe(moduleId);
          expect(images[0]!.image.id).toBe(id);
          expect(images[0]!.image.mime).toBe(mime);
          expect(new Uint8Array(fromBase64(images[0]!.image.base64))).toEqual(bytes);
        }),
        { numRuns: 100 },
      );
    });
  }, 60_000);
});
