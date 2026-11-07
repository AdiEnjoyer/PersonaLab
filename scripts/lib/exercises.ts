import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encode } from 'blurhash';
import sharp from 'sharp';
import { CATEGORIES, EQUIPMENT, LEVELS, LIBRARY_IMAGE_MAX_SIDE, MUSCLES } from '../../src/modules/gym/constants';

// ---------------------------------------------------------------------------------------------
// Pure part (R13.1, R13.3, R13.4, R13.8)
// ---------------------------------------------------------------------------------------------

export interface LibraryExerciseDraft {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  level: string;
  instructions: string[];
  /** Image paths relative to the source `exercises/` folder, in source order. */
  images: string[];
}

export type Normalised =
  | { kind: 'ok'; record: LibraryExerciseDraft }
  | { kind: 'excluded'; ref: string; reason: string } // R13.4
  | { kind: 'fatal'; id: string; field: string; value: unknown }; // R13.8

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const MUSCLE_BY_LOWER = new Map<string, string>(MUSCLES.map((m) => [m, m]));
const EQUIPMENT_SET = new Set<string>(EQUIPMENT);
const CATEGORY_SET = new Set<string>(CATEGORIES);
const LEVEL_SET = new Set<string>(LEVELS);

/** How a record is named in messages: its id, or `#<position>` when the id is missing. */
function refOf(raw: unknown, index: number): string {
  if (isRecord(raw) && typeof raw.id === 'string' && raw.id.trim() !== '') return raw.id;
  return `#${index}`;
}

/** The canonical spelling of `value`, or `undefined` when it is not in the muscle list (R13.3). */
export function canonicalMuscle(value: unknown): string | undefined {
  return typeof value === 'string' ? MUSCLE_BY_LOWER.get(value.trim().toLowerCase()) : undefined;
}

export function normaliseExercise(raw: unknown, index: number): Normalised {
  const ref = refOf(raw, index);
  if (!isRecord(raw)) return { kind: 'excluded', ref, reason: 'the record is not an object' };

  // Fatal value checks come first: they stop the run before anything is written (R13.8).
  for (const field of ['primaryMuscles', 'secondaryMuscles'] as const) {
    const list = raw[field];
    if (Array.isArray(list)) {
      for (const value of list) {
        if (canonicalMuscle(value) === undefined) return { kind: 'fatal', id: ref, field, value };
      }
    }
  }
  const equipment = raw.equipment;
  if (equipment !== undefined && equipment !== null && !(typeof equipment === 'string' && EQUIPMENT_SET.has(equipment))) {
    return { kind: 'fatal', id: ref, field: 'equipment', value: equipment };
  }
  if (typeof raw.category !== 'string' || !CATEGORY_SET.has(raw.category)) {
    return { kind: 'fatal', id: ref, field: 'category', value: raw.category };
  }
  if (typeof raw.level !== 'string' || !LEVEL_SET.has(raw.level)) {
    return { kind: 'fatal', id: ref, field: 'level', value: raw.level };
  }

  if (typeof raw.id !== 'string' || raw.id.trim() === '') return { kind: 'excluded', ref, reason: 'missing or empty id' };
  if (typeof raw.name !== 'string' || raw.name.trim() === '') return { kind: 'excluded', ref, reason: 'missing or empty name' };
  if (!Array.isArray(raw.primaryMuscles) || raw.primaryMuscles.length === 0) {
    return { kind: 'excluded', ref, reason: 'missing or empty primary muscles' };
  }

  const muscles = (list: unknown): string[] => (Array.isArray(list) ? list.map((m) => canonicalMuscle(m)!) : []);
  const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []);
  return {
    kind: 'ok',
    record: {
      id: raw.id,
      name: raw.name.trim(),
      primaryMuscles: muscles(raw.primaryMuscles),
      secondaryMuscles: muscles(raw.secondaryMuscles),
      equipment: typeof equipment === 'string' ? equipment : 'other',
      category: raw.category,
      level: raw.level,
      instructions: strings(raw.instructions),
      images: strings(raw.images),
    },
  };
}

/** Ids that occur more than once in the source (R13.8), each listed once, in code-unit order. */
export function findDuplicateIds(raws: unknown[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of raws) {
    if (!isRecord(raw) || typeof raw.id !== 'string') continue;
    if (seen.has(raw.id)) duplicates.add(raw.id);
    seen.add(raw.id);
  }
  return [...duplicates].sort(compareCodeUnits);
}

export const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// Build run (I/O)
// ---------------------------------------------------------------------------------------------

export interface BuiltImage {
  path: string;
  blurhash: string;
  width: number;
  height: number;
}

export interface FatalIssue {
  id: string;
  field: string;
  value: unknown;
}

export type BuildResult =
  | { ok: true; included: number; excluded: number; imagesWritten: number; imagesDropped: number }
  | { ok: false; fatals: FatalIssue[] };

export interface BuildOptions {
  /** A free-exercise-db checkout: `dist/exercises.json` and `exercises/<image path>`. */
  srcDir: string;
  /** Output directory, e.g. `public/exercises`: receives `exercises.json` and `img/`. */
  outDir: string;
  log?: (line: string) => void;
}

export type LibraryRecord = Omit<LibraryExerciseDraft, 'images'> & { images: BuiltImage[] };

/** Fixed key order, no timestamps: the output is byte-identical across runs (R13.5). */
export function serialiseLibrary(records: LibraryRecord[]): string {
  const ordered = records.map((r) => ({
    id: r.id,
    name: r.name,
    primaryMuscles: r.primaryMuscles,
    secondaryMuscles: r.secondaryMuscles,
    equipment: r.equipment,
    category: r.category,
    level: r.level,
    instructions: r.instructions,
    images: r.images.map((i) => ({ path: i.path, blurhash: i.blurhash, width: i.width, height: i.height })),
  }));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

interface ResizedImage extends BuiltImage {
  bytes: Buffer;
}

/** Resizes to at most 600 px on the long side (no enlarging) and computes the BlurHash (R13.1, R13.2). */
export async function resizeAndHash(source: Buffer, imagePath: string): Promise<ResizedImage> {
  const { data, info } = await sharp(source)
    .rotate()
    .resize({ width: LIBRARY_IMAGE_MAX_SIDE, height: LIBRARY_IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const raw = await sharp(data).resize(32, 32, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const blurhash = encode(new Uint8ClampedArray(raw), 32, 32, 4, 3);
  return { path: imagePath, blurhash, width: info.width, height: info.height, bytes: data };
}

export async function buildExercises(options: BuildOptions): Promise<BuildResult> {
  const log = options.log ?? (() => undefined);
  const source: unknown = JSON.parse(await readFile(path.join(options.srcDir, 'dist', 'exercises.json'), 'utf8'));
  if (!Array.isArray(source)) throw new Error('dist/exercises.json is not a list of exercises');

  // 1. Fatal checks for all records before anything is written (R13.8).
  const fatals: FatalIssue[] = findDuplicateIds(source).map((id) => ({ id, field: 'id', value: id }));
  const normalised = source.map((raw, i) => normaliseExercise(raw, i));
  for (const n of normalised) if (n.kind === 'fatal') fatals.push({ id: n.id, field: n.field, value: n.value });
  if (fatals.length > 0) {
    for (const f of fatals) log(`fatal: ${f.id}: ${f.field} = ${JSON.stringify(f.value)}`);
    return { ok: false, fatals };
  }

  // 2. Excluded records are printed and skipped (R13.4).
  const drafts: LibraryExerciseDraft[] = [];
  let excluded = 0;
  for (const n of normalised) {
    if (n.kind === 'ok') drafts.push(n.record);
    else if (n.kind === 'excluded') {
      excluded += 1;
      log(`excluded: ${n.ref}: ${n.reason}`);
    }
  }
  drafts.sort((a, b) => compareCodeUnits(a.id, b.id));

  // 3. Images go to a temporary directory that replaces the output only on success.
  const tmpDir = `${options.outDir}.tmp`;
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(path.join(tmpDir, 'img'), { recursive: true });
  const records: LibraryRecord[] = [];
  let imagesWritten = 0;
  let imagesDropped = 0;
  try {
    for (const draft of drafts) {
      const images: BuiltImage[] = [];
      for (const imagePath of draft.images) {
        try {
          const resized = await resizeAndHash(await readFile(path.join(options.srcDir, 'exercises', imagePath)), imagePath);
          const target = path.join(tmpDir, 'img', ...imagePath.split('/'));
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, resized.bytes);
          images.push({ path: resized.path, blurhash: resized.blurhash, width: resized.width, height: resized.height });
          imagesWritten += 1;
        } catch {
          imagesDropped += 1;
          log(`image dropped: ${draft.id}: ${imagePath}`); // R13.9
        }
      }
      records.push({ ...draft, images });
    }
    await writeFile(path.join(tmpDir, 'exercises.json'), serialiseLibrary(records), 'utf8');
    await rm(options.outDir, { recursive: true, force: true });
    await rename(tmpDir, options.outDir);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
  log(`included ${drafts.length}, excluded ${excluded}, images ${imagesWritten} written, ${imagesDropped} dropped`);
  return { ok: true, included: drafts.length, excluded, imagesWritten, imagesDropped };
}
