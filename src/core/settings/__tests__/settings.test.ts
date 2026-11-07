import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db } from '../../db/db';
import { DbWriteError } from '../../db/errors';
import { CORE_TABLES } from '../../db/tables';
import { MODULES } from '../../registry/modules';
import { installWriteFailures, withFreshDb } from '../../../test/helpers/db';
import { commitSetting, readSetting } from '../repo';
import {
  buildSettingsRegistry,
  CORE_SETTING_KEYS,
  settingDefinition,
  settingsRegistry,
  UnknownSettingError,
  validateSetting,
} from '../schema';

const failures = installWriteFailures(db);

beforeEach(async () => {
  failures.clear();
  await withFreshDb(async () => undefined);
});

const stored = (key: string) => db.table(CORE_TABLES.settings).get(key);

describe('schema registry', () => {
  it('holds the core key followed by every module key in registry order, with the design defaults', () => {
    const defaults = Object.fromEntries([...settingsRegistry()].map(([key, def]) => [key, def.defaultValue]));
    expect(defaults).toEqual({
      'core.backupReminderDays': 7,
      'gym.defaultRestSec': 90,
      'gym.restSound': true,
      'nutrition.trainingOverride': { enabled: false, hours: 0 },
      'nutrition.goalAdjust': { cut: -500, maintain: 0, bulk: 300 },
      'nutrition.proteinFactor': { cut: 'default', maintain: 'default', bulk: 'default' },
      'chess.username': 'AdiChessLarper',
      'chess.proxyUrl': '',
      'chess.ratingSource': 'rapid',
      'chess.manualRating': 1100,
    });
    expect([...settingsRegistry().values()].map((d) => d.owner)).toEqual([
      'core', 'gym', 'gym', 'nutrition', 'nutrition', 'nutrition', 'chess', 'chess', 'chess', 'chess',
    ]);
  });

  it('reads module schemas through MODULES', () => {
    for (const mod of MODULES) {
      for (const key of Object.keys(mod.settings?.schema ?? {})) {
        expect(settingDefinition(`${mod.id}.${key}`).schema).toBe(mod.settings!.schema[key]);
      }
    }
  });

  it('freezes defaults so a caller cannot change them', () => {
    const value = settingDefinition('nutrition.goalAdjust').defaultValue as { cut: number };
    expect(() => {
      value.cut = 0;
    }).toThrow(TypeError);
  });

  it('rejects inconsistent declarations', () => {
    const settings = (schema: Record<string, z.ZodType>, defaults: Record<string, unknown>) => ({
      schema,
      defaults,
      Section: () => null,
    });
    const num = z.number().describe('Accepted values: numbers.');
    expect(() => buildSettingsRegistry([{ id: 'a', settings: settings({ x: num }, {}) }])).toThrow(/no default/);
    expect(() => buildSettingsRegistry([{ id: 'a', settings: settings({}, { x: 1 }) }])).toThrow(/no schema/);
    expect(() => buildSettingsRegistry([{ id: 'a', settings: settings({ x: num }, { x: 'no' }) }])).toThrow(/not accepted/);
    expect(() => buildSettingsRegistry([{ id: 'a', settings: settings({ x: z.number() }, { x: 1 }) }])).toThrow(/accepted-values/);
    expect(() =>
      buildSettingsRegistry([
        { id: 'a', settings: settings({ x: num }, { x: 1 }) },
        { id: 'a', settings: settings({ x: num }, { x: 1 }) },
      ]),
    ).toThrow(/Duplicate/);
  });

  it('throws UnknownSettingError for an undeclared key', () => {
    expect(() => settingDefinition('gym.nope')).toThrow(UnknownSettingError);
    expect(() => validateSetting('nope', 1)).toThrow(UnknownSettingError);
  });

  it('returns the schema output, e.g. the trimmed username with its case kept', () => {
    expect(validateSetting('chess.username', '  Magnus_C-1  ')).toEqual({ ok: true, value: 'Magnus_C-1' });
  });

  it.each([
    ['core.backupReminderDays', [3, 7, 14, 30, 'off'], [0, 1, 5, 31, 'Off', '7', null, 7.5]],
    ['gym.defaultRestSec', [30, 45, 90, 600], [15, 29, 31, 50, 615, 90.5, '90', Number.NaN]],
    ['gym.restSound', [true, false], [0, 1, 'true', null]],
    [
      'nutrition.trainingOverride',
      [{ enabled: true, hours: 0 }, { enabled: false, hours: 40 }, { enabled: true, hours: 3.5 }],
      [{ enabled: true, hours: 3.2 }, { enabled: true, hours: 40.5 }, { enabled: true, hours: -0.5 }, { enabled: 1, hours: 1 }, { enabled: true }, { enabled: true, hours: 1, x: 1 }],
    ],
    [
      'nutrition.goalAdjust',
      [{ cut: -1000, maintain: 0, bulk: 1000 }, { cut: -50, maintain: 50, bulk: 300 }],
      [{ cut: -1050, maintain: 0, bulk: 0 }, { cut: -525, maintain: 0, bulk: 0 }, { cut: 0, maintain: 0 }, { cut: 0, maintain: 0, bulk: 25.5 }],
    ],
    [
      'nutrition.proteinFactor',
      [{ cut: 'default', maintain: 1.6, bulk: 2.2 }, { cut: 1.7, maintain: 1.9, bulk: 2.1 }],
      [{ cut: 1.5, maintain: 1.8, bulk: 1.8 }, { cut: 1.65, maintain: 1.8, bulk: 1.8 }, { cut: 2.3, maintain: 1.8, bulk: 1.8 }, { cut: 17 * 0.1, maintain: 1.8, bulk: 1.8 }, { cut: 'Default', maintain: 1.8, bulk: 1.8 }],
    ],
    ['chess.username', ['abc', 'A'.repeat(25), 'Adi_Chess-1', ' abc '], ['ab', 'A'.repeat(26), 'adi chess', 'adi.chess', 'ädi', '', 5]],
    ['chess.proxyUrl', ['', 'https://proxy.example.com/', `https://a.io/${'x'.repeat(2035)}`], ['http://proxy.example.com', 'https://', 'proxy.example.com', `https://a.io/${'x'.repeat(2036)}`, ' https://a.io']],
    ['chess.ratingSource', ['rapid', 'manual'], ['Rapid', 'blitz', '']],
    ['chess.manualRating', [100, 1100, 3000], [99, 3001, 1100.5, '1100']],
  ] as const)('%s accepts exactly its accepted values', (key, accepted, rejected) => {
    for (const v of accepted) expect(validateSetting(key, v), JSON.stringify(v)).toMatchObject({ ok: true });
    for (const v of rejected) {
      expect(validateSetting(key, v), JSON.stringify(v)).toEqual({ ok: false, error: settingDefinition(key).acceptedValues });
    }
  });
});

describe('readSetting and commitSetting', () => {
  it('reads the default for an unset key', async () => {
    await expect(readSetting(CORE_SETTING_KEYS.backupReminderDays)).resolves.toBe(7);
    await expect(readSetting('chess.username')).resolves.toBe('AdiChessLarper');
    await expect(stored(CORE_SETTING_KEYS.backupReminderDays)).resolves.toBeUndefined();
  });

  it('stores an accepted value and reads it back', async () => {
    await expect(commitSetting('gym.defaultRestSec', 120)).resolves.toEqual({ ok: true });
    await expect(readSetting('gym.defaultRestSec')).resolves.toBe(120);
    await expect(stored('gym.defaultRestSec')).resolves.toEqual({ key: 'gym.defaultRestSec', value: 120 });
  });

  it('stores the trimmed username', async () => {
    await commitSetting('chess.username', '  Hikaru  ');
    await expect(stored('chess.username')).resolves.toEqual({ key: 'chess.username', value: 'Hikaru' });
  });

  it('leaves the stored value unchanged and returns the accepted values for an invalid commit', async () => {
    await commitSetting(CORE_SETTING_KEYS.backupReminderDays, 14);
    const result = await commitSetting(CORE_SETTING_KEYS.backupReminderDays, 10);
    expect(result).toEqual({ ok: false, error: 'Accepted values: 3, 7, 14 or 30 days, or off.' });
    await expect(readSetting(CORE_SETTING_KEYS.backupReminderDays)).resolves.toBe(14);
  });

  it('writes nothing for an invalid commit of an unset key', async () => {
    await commitSetting('gym.defaultRestSec', 95);
    await expect(stored('gym.defaultRestSec')).resolves.toBeUndefined();
    await expect(readSetting('gym.defaultRestSec')).resolves.toBe(90);
  });

  it('rejects with DbWriteError and keeps the stored value when the write fails', async () => {
    await commitSetting('chess.manualRating', 1500);
    failures.failNext(CORE_TABLES.settings, () => new DOMException('full', 'QuotaExceededError'));
    await expect(commitSetting('chess.manualRating', 1600)).rejects.toBeInstanceOf(DbWriteError);
    await expect(readSetting('chess.manualRating')).resolves.toBe(1500);
  });

  it('reads the default when the stored value is not accepted by the schema', async () => {
    await db.table(CORE_TABLES.settings).put({ key: 'gym.restSound', value: 'loud' });
    await expect(readSetting('gym.restSound')).resolves.toBe(true);
  });

  it('throws UnknownSettingError for undeclared keys', async () => {
    await expect(readSetting('core.nope')).rejects.toBeInstanceOf(UnknownSettingError);
    await expect(commitSetting('core.nope', 1)).rejects.toBeInstanceOf(UnknownSettingError);
  });
});
