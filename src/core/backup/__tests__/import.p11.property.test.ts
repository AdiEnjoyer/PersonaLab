// Feature: personal-lab, Property 11: Import validation stops at the earliest failing stage
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  arbAppState,
  arbBackupFile,
  dumpAppState,
  seedAppState,
  TEST_DATA_VERSIONS,
  withTestApp,
} from '../../../test/arbitraries/appState';
import { checkBackupFile, type ImportStage } from '../import';
import { IMPORT_MESSAGES } from '../messages';

/** The corruptible stages in R7.1 order. */
const STAGES = ['json', 'envelope', 'version', 'migration', 'record'] as const;
type Stage = (typeof STAGES)[number];

type Mutable = Record<string, unknown> & { modules: Array<Record<string, unknown>>; core: { profile: unknown; settings: unknown[] } };

interface Corruption {
  json: 'truncate' | 'prefix' | 'empty' | 'trailing';
  envelope: 'format' | 'noFormat' | 'noVersion' | 'zero' | 'fraction' | 'text' | 'array';
  version: { kind: 'file'; to: number } | { kind: 'module'; id: 'alpha' | 'gamma'; by: number };
  migration: 'noEntries' | 'notObject';
  record: 'setting' | 'item' | 'profile';
}

const arbCorruption: fc.Arbitrary<Corruption> = fc.record({
  json: fc.constantFrom('truncate', 'prefix', 'empty', 'trailing'),
  envelope: fc.constantFrom('format', 'noFormat', 'noVersion', 'zero', 'fraction', 'text', 'array'),
  version: fc.oneof(
    fc.record({ kind: fc.constant('file' as const), to: fc.integer({ min: 2, max: 50 }) }),
    fc.record({ kind: fc.constant('module' as const), id: fc.constantFrom('alpha' as const, 'gamma' as const), by: fc.integer({ min: 1, max: 20 }) }),
  ),
  migration: fc.constantFrom('noEntries', 'notObject'),
  record: fc.constantFrom('setting', 'item', 'profile'),
});

/** A non-empty set of stages to corrupt. */
const arbStages = fc.subarray([...STAGES], { minLength: 1 });

function entry(file: Mutable, id: string): Record<string, unknown> {
  return file.modules.find((m) => m.id === id)!;
}

/** Applies the chosen corruptions, later stages first, so each stays visible to its own check. */
function corrupt(text: string, stages: readonly Stage[], c: Corruption): string {
  const file = JSON.parse(text) as Mutable;
  if (stages.includes('record')) {
    if (c.record === 'profile' && file.core.profile !== null) (file.core.profile as Record<string, unknown>).age = 7;
    else if (c.record === 'item') (entry(file, 'gamma').data as { items: unknown[] }).items.push({ id: 'bad', name: 'no idemKey', amount: 1, position: 0, tags: [] });
    else file.core.settings.push({ key: 'alpha.level', value: 99 });
  }
  if (stages.includes('migration')) {
    const beta = entry(file, 'beta');
    beta.dataVersion = TEST_DATA_VERSIONS.beta - 1;
    if (c.migration === 'notObject') beta.data = 'not module data';
  }
  if (stages.includes('version')) {
    if (c.version.kind === 'file') file.schemaVersion = c.version.to;
    else entry(file, c.version.id).dataVersion = TEST_DATA_VERSIONS[c.version.id] + c.version.by;
  }
  let value: unknown = file;
  if (stages.includes('envelope')) {
    switch (c.envelope) {
      case 'format':
        file.format = 'personallab-backup-old';
        break;
      case 'noFormat':
        delete file.format;
        break;
      case 'noVersion':
        delete file.schemaVersion;
        break;
      case 'zero':
        file.schemaVersion = 0;
        break;
      case 'fraction':
        file.schemaVersion = 1.5;
        break;
      case 'text':
        file.schemaVersion = '1';
        break;
      case 'array':
        value = [file];
        break;
    }
  }
  const printed = JSON.stringify(value);
  if (!stages.includes('json')) return printed;
  switch (c.json) {
    case 'truncate':
      return printed.slice(0, -1);
    case 'prefix':
      return `PersonalLab ${printed}`;
    case 'empty':
      return '';
    case 'trailing':
      return `${printed},`;
  }
}

/** The R7 message of the earliest corrupted stage. */
function expectedMessage(stage: Stage, c: Corruption): string | RegExp {
  switch (stage) {
    case 'json':
      return IMPORT_MESSAGES.notJson;
    case 'envelope':
      return IMPORT_MESSAGES.notBackup;
    case 'version':
      return c.version.kind === 'file'
        ? IMPORT_MESSAGES.newerFile(c.version.to, 1)
        : IMPORT_MESSAGES.newerModule(TEST_DATA_VERSIONS[c.version.id] + c.version.by, TEST_DATA_VERSIONS[c.version.id], c.version.id);
    case 'migration':
      return IMPORT_MESSAGES.migrationFailed(1);
    case 'record':
      return /^Invalid record in (core data|gamma), record \d+: (age|value|key|idemKey)\.$/;
  }
}

describe('checkBackupFile', () => {
  it('reports the earliest corrupted stage in R7.1 order and leaves the database unchanged', async () => {
    await withTestApp(async ({ database, modules }) => {
      const [stored] = fc.sample(arbAppState, { numRuns: 1, seed: 11 });
      await seedAppState(database, stored!, 'AIzaUntouched');
      const start = await dumpAppState(database);

      await fc.assert(
        fc.asyncProperty(arbBackupFile, arbStages, arbCorruption, async ({ text }, stages, c) => {
          // Sanity: the uncorrupted file passes.
          expect((await checkBackupFile(new File([text], 'b.json'), modules)).ok).toBe(true);

          const earliest = STAGES.find((s) => stages.includes(s))!;
          const result = await checkBackupFile(new File([corrupt(text, stages, c)], 'b.json'), modules);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.stage).toBe(earliest satisfies ImportStage);
          const message = expectedMessage(earliest, c);
          if (typeof message === 'string') expect(result.message).toBe(message);
          else expect(result.message).toMatch(message);
          expect(await dumpAppState(database)).toEqual(start);
        }),
        { numRuns: 200 },
      );
    });
  }, 120_000);
});
