import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildExercises, findDuplicateIds, normaliseExercise } from '../exercises';

const valid = {
  id: 'Bench_Press',
  name: '  Bench Press ',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: [' Chest '],
  secondaryMuscles: ['TRICEPS', 'shoulders'],
  instructions: ['Lie down.', 'Press.'],
  category: 'strength',
  images: ['Bench_Press/0.jpg', 'Bench_Press/1.jpg'],
};

describe('normaliseExercise', () => {
  it('trims the name, canonicalises muscles and defaults equipment to other', () => {
    const r = normaliseExercise({ ...valid, equipment: null }, 0);
    expect(r).toMatchObject({
      kind: 'ok',
      record: { name: 'Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], equipment: 'other' },
    });
  });

  it('excludes records with missing id, name or primary muscles and names them', () => {
    expect(normaliseExercise({ ...valid, id: '  ' }, 4)).toMatchObject({ kind: 'excluded', ref: '#4' });
    expect(normaliseExercise({ ...valid, id: undefined }, 7)).toMatchObject({ kind: 'excluded', ref: '#7' });
    expect(normaliseExercise({ ...valid, name: ' ' }, 0)).toMatchObject({ kind: 'excluded', ref: 'Bench_Press' });
    expect(normaliseExercise({ ...valid, primaryMuscles: [] }, 0)).toMatchObject({ kind: 'excluded' });
  });

  it('is fatal for unknown muscle, equipment, category and level', () => {
    expect(normaliseExercise({ ...valid, primaryMuscles: ['wings'] }, 0)).toMatchObject({ kind: 'fatal', field: 'primaryMuscles', value: 'wings' });
    expect(normaliseExercise({ ...valid, equipment: 'rope' }, 0)).toMatchObject({ kind: 'fatal', field: 'equipment' });
    expect(normaliseExercise({ ...valid, category: 'yoga' }, 0)).toMatchObject({ kind: 'fatal', field: 'category' });
    expect(normaliseExercise({ ...valid, level: 'god' }, 0)).toMatchObject({ kind: 'fatal', field: 'level' });
  });

  it('finds duplicate ids', () => {
    expect(findDuplicateIds([valid, { ...valid }, { ...valid, id: 'x' }])).toEqual(['Bench_Press']);
  });
});

describe('buildExercises', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'ex-build-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeSource(records: unknown[]): Promise<string> {
    const src = path.join(root, 'src');
    await mkdir(path.join(src, 'dist'), { recursive: true });
    await mkdir(path.join(src, 'exercises', 'Bench_Press'), { recursive: true });
    await writeFile(path.join(src, 'dist', 'exercises.json'), JSON.stringify(records));
    const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
    await writeFile(path.join(src, 'exercises', 'Bench_Press', '0.jpg'), await png(1200, 800));
    await writeFile(path.join(src, 'exercises', 'Bench_Press', '1.jpg'), await png(300, 200));
    return src;
  }

  async function snapshot(dir: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const walk = async (d: string): Promise<void> => {
      for (const name of (await readdir(d)).sort()) {
        const full = path.join(d, name);
        if ((await stat(full)).isDirectory()) await walk(full);
        else out[path.relative(dir, full)] = (await readFile(full)).toString('base64');
      }
    };
    await walk(dir);
    return out;
  }

  it('writes sorted data, resized images and blurhashes, dropping unreadable images', async () => {
    const other = { ...valid, id: 'A_First', images: ['Missing/0.jpg'] };
    const src = await makeSource([valid, other, { ...valid, id: '', name: 'bad' }]);
    const out = path.join(root, 'out');
    const logs: string[] = [];
    const result = await buildExercises({ srcDir: src, outDir: out, log: (l) => logs.push(l) });
    expect(result).toMatchObject({ ok: true, included: 2, excluded: 1, imagesWritten: 2, imagesDropped: 1 });
    const data = JSON.parse(await readFile(path.join(out, 'exercises.json'), 'utf8')) as Array<{ id: string; images: Array<{ width: number; height: number; blurhash: string }> }>;
    expect(data.map((d) => d.id)).toEqual(['A_First', 'Bench_Press']);
    expect(data[0]!.images).toEqual([]);
    expect(data[1]!.images.map((i) => [i.width, i.height])).toEqual([[600, 400], [300, 200]]);
    expect(data[1]!.images[0]!.blurhash.length).toBeGreaterThan(6);
    expect(logs.some((l) => l.includes('Missing/0.jpg'))).toBe(true);
  });

  it('is byte-identical across runs', async () => {
    const src = await makeSource([valid]);
    const a = path.join(root, 'a');
    const b = path.join(root, 'b');
    await buildExercises({ srcDir: src, outDir: a });
    await buildExercises({ srcDir: src, outDir: b });
    expect(await snapshot(a)).toEqual(await snapshot(b));
  });

  it('on a fatal record changes nothing and reports it', async () => {
    const src = await makeSource([valid, { ...valid, id: 'Bad', level: 'god' }]);
    const out = path.join(root, 'out');
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'exercises.json'), 'old');
    const result = await buildExercises({ srcDir: src, outDir: out });
    expect(result).toMatchObject({ ok: false, fatals: [{ id: 'Bad', field: 'level', value: 'god' }] });
    expect(await readFile(path.join(out, 'exercises.json'), 'utf8')).toBe('old');
  });
});
