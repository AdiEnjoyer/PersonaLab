import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BACKUP_FORMAT } from '../format';
import { checkBackupFile, formatPath, validateBackupValue } from '../import';
import { IMPORT_MESSAGES } from '../messages';
import type { BackupModule } from '../types';

const Item = z.strictObject({ id: z.string().min(1), qty: z.number().int().min(0), tags: z.array(z.string()) });
const Note = z.strictObject({ id: z.string().min(1), text: z.string() });
const ListData = z.strictObject({ items: z.array(Item), notes: z.array(Note) });
type ListData = z.infer<typeof ListData>;

function listModule(id: string, name: string, extra: Partial<BackupModule['backup']> = {}): BackupModule {
  return {
    id,
    name,
    tables: {},
    exportData: async () => ({ items: [], notes: [] }),
    importData: async () => undefined,
    backup: {
      dataVersion: 1,
      schema: ListData,
      migrations: {},
      sections: (data: unknown) => {
        const d = data as ListData;
        return [
          { name: 'items', records: d.items },
          { name: 'notes', records: d.notes },
        ];
      },
      ...extra,
    },
    settings: {
      schema: { size: z.number().int().min(1).max(5).describe('Accepted values: 1 to 5.') },
      defaults: { size: 3 },
      Section: () => null,
    },
  };
}

/** `beta` is at data version 2; its v1 → v2 migration renames `entries` to `items` and needs an array. */
const beta = listModule('beta', 'Beta', {
  dataVersion: 2,
  migrations: {
    1: (data: unknown) => {
      const d = data as { entries: unknown; notes: unknown };
      if (!Array.isArray(d.entries)) throw new Error('entries must be an array');
      return { items: d.entries, notes: d.notes };
    },
  },
});
const MODS: readonly BackupModule[] = [listModule('alpha', 'Alpha'), beta];

const profile = {
  id: 'profile',
  age: 30,
  sex: 'female',
  heightCm: 170,
  weightKg: 62.5,
  weeklyTrainingHours: 3.5,
  goal: 'maintain',
  updatedAt: 1_700_000_000_000,
};

function validFile() {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: 1,
    appVersion: '1.0.0+abc1234',
    exportedAt: '2025-03-07T07:05:00Z',
    core: {
      profile: { ...profile },
      settings: [
        { key: 'alpha.size', value: 2 },
        { key: 'core.backupReminderDays', value: 14 },
      ] as Array<{ key: string; value: unknown }>,
    },
    modules: [
      {
        id: 'alpha',
        dataVersion: 1,
        data: {
          items: [
            { id: 'a1', qty: 1, tags: [] },
            { id: 'a2', qty: 2, tags: ['x', 'y'] },
          ],
          notes: [{ id: 'n1', text: 'שלום 💪' }],
        },
      },
      { id: 'beta', dataVersion: 2, data: { items: [{ id: 'b1', qty: 0, tags: [] }], notes: [] } },
    ],
  };
}

const fileOf = (text: string) => new File([text], 'backup.json', { type: 'application/json' });
const check = (value: unknown) => checkBackupFile(fileOf(JSON.stringify(value)), MODS);

async function messageOf(value: unknown): Promise<string | undefined> {
  const result = await check(value);
  return result.ok ? undefined : result.message;
}

describe('checkBackupFile messages (R7)', () => {
  it('reports a file that cannot be read', async () => {
    const unreadable = { size: 10, text: () => Promise.reject(new DOMException('gone', 'NotReadableError')) } as unknown as Blob;
    expect(await checkBackupFile(unreadable, MODS)).toEqual({ ok: false, stage: 'read', message: 'The file could not be read.' });
  });

  it('rejects an empty file and invalid JSON', async () => {
    const message = 'This file is not a PersonalLab backup (not valid JSON).';
    expect(await checkBackupFile(fileOf(''), MODS)).toMatchObject({ ok: false, stage: 'json', message });
    expect(await checkBackupFile(fileOf('{"format": "personallab-backup",'), MODS)).toMatchObject({ ok: false, stage: 'json', message });
    expect(await checkBackupFile(fileOf('not json'), MODS)).toMatchObject({ ok: false, stage: 'json', message });
  });

  it('rejects a file without the format identifier or a valid Schema_Version', async () => {
    const message = 'This file is not a PersonalLab backup.';
    const { format: _format, ...noFormat } = validFile();
    const { schemaVersion: _version, ...noVersion } = validFile();
    expect(await messageOf(noFormat)).toBe(message);
    expect(await messageOf({ ...validFile(), format: 'other-backup' })).toBe(message);
    expect(await messageOf(noVersion)).toBe(message);
    expect(await messageOf({ ...validFile(), schemaVersion: 0 })).toBe(message);
    expect(await messageOf({ ...validFile(), schemaVersion: 1.5 })).toBe(message);
    expect(await messageOf([1, 2, 3])).toBe(message);
    expect(await messageOf(null)).toBe(message);
  });

  it('rejects a file with a broken header structure', async () => {
    const message = 'This file is not a PersonalLab backup.';
    expect(await messageOf({ ...validFile(), exportedAt: 'yesterday' })).toBe(message);
    expect(await messageOf({ ...validFile(), modules: {} })).toBe(message);
    const { core: _core, ...noCore } = validFile();
    expect(await messageOf(noCore)).toBe(message);
    const file = validFile();
    expect(await messageOf({ ...file, modules: [...file.modules, file.modules[0]] })).toBe(message);
  });

  it('rejects a newer Schema_Version, naming both versions', async () => {
    expect(await messageOf({ ...validFile(), schemaVersion: 2 })).toBe(
      'This backup was made by a newer version (file v2, supported v1). Update the app.',
    );
  });

  it('rejects a newer module data version, naming both versions and the module', async () => {
    const file = validFile();
    file.modules[1]!.dataVersion = 3;
    expect(await messageOf(file)).toBe(
      'This backup was made by a newer version (file v3, supported v2, module beta). Update the app.',
    );
  });

  it('rejects a file whose migration fails, naming its Schema_Version', async () => {
    const file = validFile();
    file.modules[1] = { id: 'beta', dataVersion: 1, data: { entries: 'nope', notes: [] } as never };
    expect(await check(file)).toEqual({ ok: false, stage: 'migration', message: 'This backup (version 1) could not be upgraded.' });
  });

  it('migrates an older module entry before validating it', async () => {
    const file = validFile();
    file.modules[1] = { id: 'beta', dataVersion: 1, data: { entries: [{ id: 'b9', qty: 4, tags: [] }], notes: [] } as never };
    const result = await check(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.file.modules[1]).toEqual({ id: 'beta', dataVersion: 2, data: { items: [{ id: 'b9', qty: 4, tags: [] }], notes: [] } });
  });

  it('names core data, record 1 and the field for an invalid Profile', async () => {
    const file = validFile();
    file.core.profile.age = 200;
    expect(await check(file)).toEqual({
      ok: false,
      stage: 'record',
      message: 'Invalid record in core data, record 1: age.',
      section: 'core data',
      position: 1,
      field: 'age',
    });
  });

  it('counts settings after the Profile and names the value field', async () => {
    const file = validFile();
    file.core.settings[1]!.value = 5;
    expect(await messageOf(file)).toBe('Invalid record in core data, record 3: value.');
    const noProfile = { ...validFile(), core: { ...validFile().core, profile: null } };
    noProfile.core.settings[0]!.value = 'big';
    expect(await messageOf(noProfile)).toBe('Invalid record in core data, record 1: value.');
  });

  it('rejects an unknown setting key of a registered module or of core', async () => {
    const file = validFile();
    file.core.settings.push({ key: 'alpha.colour', value: 'red' });
    expect(await messageOf(file)).toBe('Invalid record in core data, record 4: key.');
    const core = validFile();
    core.core.settings.push({ key: 'core.unknown', value: 1 });
    expect(await messageOf(core)).toBe('Invalid record in core data, record 4: key.');
  });

  it('names the module, the record position across sections and the nested field', async () => {
    const file = validFile();
    (file.modules[0]!.data.items[1]!.tags as unknown[])[1] = 7;
    expect(await messageOf(file)).toBe('Invalid record in alpha, record 2: tags[1].');

    const note = validFile();
    (note.modules[0]!.data.notes[0] as Record<string, unknown>).text = 12;
    expect(await messageOf(note)).toBe('Invalid record in alpha, record 3: text.');

    const missing = validFile();
    delete (missing.modules[1]!.data.items[0] as Partial<{ qty: number }>).qty;
    expect(await messageOf(missing)).toBe('Invalid record in beta, record 1: qty.');

    const extra = validFile();
    (extra.modules[0]!.data.items[0] as Record<string, unknown>).colour = 'red';
    expect(await messageOf(extra)).toBe('Invalid record in alpha, record 1: colour.');
  });

  it('reports the first invalid record in file order', async () => {
    const file = validFile();
    (file.modules[0]!.data.notes[0] as Record<string, unknown>).text = 1;
    file.modules[0]!.data.items[1]!.qty = -1;
    (file.modules[1]!.data.items[0] as Record<string, unknown>).id = '';
    expect(await messageOf(file)).toBe('Invalid record in alpha, record 2: qty.');
  });

  it('reports a whole record of the wrong type', async () => {
    const file = validFile();
    (file.modules[0]!.data.items as unknown[])[0] = 42;
    expect(await messageOf(file)).toBe('Invalid record in alpha, record 1: (whole record).');
  });

  it('skips unregistered modules and their settings without validating them', async () => {
    const file = validFile();
    file.modules.splice(1, 0, { id: 'zeta', dataVersion: 99, data: 'anything' as never });
    file.core.settings.push({ key: 'omega.whatever', value: { nested: true } });
    const result = await check(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.skipped).toEqual(['zeta', 'omega']);
    expect(result.plan.file.modules.map((m) => m.id)).toEqual(['alpha', 'beta']);
    expect(result.plan.file.core.settings.map((s) => s.key)).toEqual(['alpha.size', 'core.backupReminderDays']);
  });

  it('builds the plan: export time, present modules with record counts and absent module names', async () => {
    const file = validFile();
    file.modules.splice(1, 1);
    const result = await check(file);
    expect(result).toMatchObject({
      ok: true,
      plan: {
        exportedAt: '2025-03-07T07:05:00Z',
        present: [{ id: 'alpha', name: 'Alpha', recordCount: 3 }],
        absent: ['Beta'],
        skipped: [],
      },
    });
    if (!result.ok) return;
    expect(result.plan.file.core.profile).toEqual(profile);
  });

  it('accepts a file without a Profile', async () => {
    const result = await check({ ...validFile(), core: { profile: null, settings: [] } });
    expect(result.ok).toBe(true);
  });
});

describe('validateBackupValue', () => {
  it('does not modify the value it checks', () => {
    const file = validFile();
    file.modules[1] = { id: 'beta', dataVersion: 1, data: { entries: [], notes: [] } as never };
    const copy = structuredClone(file);
    expect(validateBackupValue(file, MODS).ok).toBe(true);
    expect(file).toEqual(copy);
  });

  it('runs injected envelope migrations', () => {
    expect(validateBackupValue(validFile(), MODS, { envelopeMigrations: {} }).ok).toBe(true);
  });
});

describe('formatPath', () => {
  it('joins keys with dots and indexes with brackets', () => {
    expect(formatPath(['entries', 0, 'sets', 1, 'weight'])).toBe('entries[0].sets[1].weight');
    expect(formatPath([2, 'x'])).toBe('[2].x');
    expect(formatPath([])).toBe('(whole record)');
  });

  it('keeps the exact message wording', () => {
    expect(IMPORT_MESSAGES.invalidRecord('gym', 4, 'entries[0].sets[1].weight')).toBe(
      'Invalid record in gym, record 4: entries[0].sets[1].weight.',
    );
  });
});
