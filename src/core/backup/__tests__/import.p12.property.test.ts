// Feature: personal-lab, Property 12: The first invalid record is reported
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arbBackupFile, TEST_MODULE_IDS, TEST_MODULES } from '../../../test/arbitraries/appState';
import { checkBackupFile } from '../import';
import { IMPORT_MESSAGES } from '../messages';
import type { BackupV1 } from '../schema';

type Rec = Record<string, unknown>;

/** One way to make a record invalid, and the field path the rejection must name. */
interface Damage {
  field: string;
  apply(record: Rec): void;
}

const set = (field: string, value: unknown): Damage => ({ field, apply: (r) => void (r[field] = value) });
const drop = (field: string): Damage => ({ field, apply: (r) => void delete r[field] });

/** Wrong type, out-of-range number and missing required field for each record kind (plus a few extras). */
const PROFILE_DAMAGE: Damage[] = [set('age', 5), set('sex', 3), drop('heightCm'), set('weightKg', 70.25), set('goal', 'gain'), set('updatedAt', -1)];
const ITEM_DAMAGE: Damage[] = [set('amount', 'x'), set('position', -1), drop('idemKey'), set('name', 'x'.repeat(401)), set('colour', 'red'), set('tags', [1])];
const IMAGE_DAMAGE: Damage[] = [set('width', -1), drop('mime'), set('base64', 'not base64!'), set('height', '1'), set('mime', 'text/plain')];
/** A setting value its key's schema rejects; the field is always `value`. */
const BAD_SETTING_VALUE: Record<string, unknown[]> = {
  'core.backupReminderDays': [5, 'never', null],
  'alpha.level': [11, -1, 1.5, '3'],
  'beta.label': [42, 'x'.repeat(201), null],
};

const FIELD_OVERRIDES: Record<string, string> = { tags: 'tags[0]' };

interface FlatRecord {
  section: string;
  position: number;
  kind: 'profile' | 'setting' | 'item' | 'image';
  record: Rec;
}

/** Every record of `file` in R7.5 file order with its section and 1-based position. */
function flatten(file: BackupV1): FlatRecord[] {
  const out: FlatRecord[] = [];
  let core = 0;
  if (file.core.profile !== null) out.push({ section: 'core data', position: ++core, kind: 'profile', record: file.core.profile as Rec });
  for (const s of file.core.settings) out.push({ section: 'core data', position: ++core, kind: 'setting', record: s as Rec });
  for (const entry of file.modules) {
    const data = entry.data as { items: Rec[]; images: Rec[] };
    let position = 0;
    for (const r of data.items) out.push({ section: entry.id, position: ++position, kind: 'item', record: r });
    for (const r of data.images) out.push({ section: entry.id, position: ++position, kind: 'image', record: r });
  }
  return out;
}

const arbOrder = fc.shuffledSubarray([...TEST_MODULE_IDS], { minLength: TEST_MODULE_IDS.length, maxLength: TEST_MODULE_IDS.length });
const arbHits = fc.array(fc.record({ target: fc.nat(), damage: fc.nat() }), { minLength: 1, maxLength: 5 });

describe('checkBackupFile', () => {
  it('names the section, 1-based position and field of the first invalid record in file order', async () => {
    await fc.assert(
      fc.asyncProperty(arbBackupFile, arbOrder, arbHits, async ({ file: original }, order, hits) => {
        const file = structuredClone(original);
        file.modules = order.map((id) => file.modules.find((m) => m.id === id)!);
        const records = flatten(file);
        fc.pre(records.length > 0);

        // Damage one field of each chosen record; remember the first damaged record in file order.
        const damaged = new Map<number, string>();
        for (const hit of hits) {
          const index = hit.target % records.length;
          if (damaged.has(index)) continue;
          const { kind, record } = records[index]!;
          let field: string;
          if (kind === 'setting') {
            const options = BAD_SETTING_VALUE[record.key as string]!;
            record.value = options[hit.damage % options.length];
            field = 'value';
          } else {
            const list = kind === 'profile' ? PROFILE_DAMAGE : kind === 'item' ? ITEM_DAMAGE : IMAGE_DAMAGE;
            const damage = list[hit.damage % list.length]!;
            damage.apply(record);
            field = FIELD_OVERRIDES[damage.field] ?? damage.field;
          }
          damaged.set(index, field);
        }
        const first = Math.min(...damaged.keys());
        const expected = records[first]!;

        const result = await checkBackupFile(new File([JSON.stringify(file)], 'b.json'), TEST_MODULES);
        expect(result).toMatchObject({
          ok: false,
          stage: 'record',
          section: expected.section,
          position: expected.position,
          field: damaged.get(first),
          message: IMPORT_MESSAGES.invalidRecord(expected.section, expected.position, damaged.get(first)!),
        });
      }),
      { numRuns: 300 },
    );
  }, 120_000);
});
