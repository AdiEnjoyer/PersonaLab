// Feature: personal-lab, Property 9: The Gemini key never appears in a Backup_File
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arbEpoch } from '../../../test/arbitraries/core';
import {
  arbAppState,
  arbGeminiKey,
  backupFileOf,
  clearAppDb,
  seedAppState,
  TEST_APP_VERSION,
  TEST_MODULE_IDS,
  withTestApp,
  type AppState,
} from '../../../test/arbitraries/appState';
import { geminiKeySchema, getSecret, SECRET_KEYS } from '../../settings/secrets';
import { exportBackup } from '../export';
import { toExportedAt } from '../format';

/** How record text overlaps the key: not at all, a prefix, a suffix, a middle part, or the whole key. */
const arbOverlap = fc.constantFrom('none', 'prefix', 'suffix', 'middle', 'whole', 'split');

/** Puts text that shares substrings with `key` into a record's name, and returns the changed state. */
function withOverlap(state: AppState, key: string, overlap: string, target: number): AppState {
  const chars = [...key];
  const half = Math.max(1, Math.floor(chars.length / 2));
  const parts: Record<string, string> = {
    none: '',
    prefix: chars.slice(0, -1).join(''),
    suffix: chars.slice(1).join(''),
    middle: chars.slice(1, -1).join(''),
    whole: `note ${key} end`,
    // Both halves, but separated, so the record holds every character without the whole key.
    split: `${chars.slice(0, half).join('')} | ${chars.slice(half).join('')}`,
  };
  const text = parts[overlap] ?? '';
  if (text === '') return state;
  const next = structuredClone(state);
  const id = TEST_MODULE_IDS[target % TEST_MODULE_IDS.length]!;
  next.modules[id].items.push({ id: `overlap-${target}`, idemKey: `overlap-idem-${target}`, name: text, amount: 1, position: 0, tags: [text] });
  return next;
}

describe('Backup_File secrets', () => {
  it('the stored Gemini key never appears in the exported text and stays stored', async () => {
    await withTestApp(async ({ database, modules }) => {
      await fc.assert(
        fc.asyncProperty(
          arbAppState,
          arbGeminiKey.filter((k) => geminiKeySchema.safeParse(k).success && k.trim() === k),
          arbOverlap,
          fc.nat(),
          arbEpoch,
          async (generated, key, overlap, target, at) => {
            const state = withOverlap(generated, key, overlap, target);
            await clearAppDb(database);
            await seedAppState(database, state, key);
            const now = new Date(at);
            const delivered: string[] = [];

            const outcome = await exportBackup({
              database,
              modules,
              appVersion: TEST_APP_VERSION,
              now: () => now,
              deliver: async (file) => {
                delivered.push(await file.text());
                return 'downloaded';
              },
            });

            // Whatever was delivered never holds the key.
            for (const text of delivered) expect(text.includes(key)).toBe(false);
            // The export only stops for the key when the file text would really contain it.
            const wouldContain = JSON.stringify(backupFileOf(state, toExportedAt(now))).includes(key);
            if (wouldContain) {
              expect(outcome).toMatchObject({ kind: 'failed', part: 'Gemini key' });
              expect(delivered).toEqual([]);
            } else {
              expect(outcome).toMatchObject({ kind: 'downloaded' });
              expect(delivered).toHaveLength(1);
            }
            expect(await getSecret(SECRET_KEYS.geminiKey, database)).toBe(key);
          },
        ),
        { numRuns: 100 },
      );
    });
  }, 120_000);
});
